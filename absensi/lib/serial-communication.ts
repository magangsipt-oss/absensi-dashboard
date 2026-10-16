let SerialPort: any;
let ReadlineParser: any;
let serialModuleError: string | null = null;
let serialConnectionError: string | null = null;

// Dynamic import untuk server-side only
if (typeof window === 'undefined') {
  try {
    const serialportModule = require("serialport");
    const parserModule = require("@serialport/parser-readline");
    SerialPort = serialportModule.SerialPort;
    ReadlineParser = parserModule.ReadlineParser;
  } catch (error) {
    serialModuleError = error instanceof Error ? error.message : String(error);
    console.error("Failed to load serialport modules:", error);
  }
}

export interface SerialConfig {
  portPath: string; // COM7, /dev/ttyUSB0, etc
  baudRate: number; // 115200
}

class SerialCommunication {
  private port: any = null;
  private parser: any = null;
  private isOpen = false;

  async connect(config: SerialConfig): Promise<boolean> {
    try {
      serialConnectionError = null;
      if (!SerialPort || !ReadlineParser) {
        console.error("Serialport modules not available");
        return false;
      }

      if (this.isOpen) {
        return true; // Already connected
      }

      this.port = new SerialPort({
        path: config.portPath,
        baudRate: config.baudRate,
      });

      this.parser = this.port.pipe(new ReadlineParser({ delimiter: "\n" }));

      return new Promise((resolve) => {
        this.port!.on("open", () => {
          this.isOpen = true;
          console.log(`Serial port ${config.portPath} opened`);
          resolve(true);
        });

        this.port!.on("error", (err: any) => {
          serialConnectionError = err instanceof Error ? err.message : String(err);
          console.error("Serial port error:", err);
          this.isOpen = false;
          resolve(false);
        });

        // Timeout after 5 seconds
        setTimeout(() => {
          if (!this.isOpen) {
            console.error("Serial port connection timeout");
            resolve(false);
          }
        }, 5000);
      });
    } catch (error) {
      serialConnectionError = error instanceof Error ? error.message : String(error);
      console.error("Error connecting to serial port:", error);
      this.isOpen = false;
      return false;
    }
  }

  async disconnect(): Promise<void> {
    return new Promise((resolve) => {
      if (this.port && this.isOpen) {
        this.port.close(() => {
          this.isOpen = false;
          console.log("Serial port closed");
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  async sendCommand(command: string): Promise<string> {
    return this.sendCommandUntil(command);
  }

  async waitForReady(attempts = 4): Promise<void> {
    for (let attempt = 0; attempt < attempts; attempt++) {
      try {
        await this.sendCommandUntil("TEST", "READY");
        return;
      } catch (error) {
        if (attempt === attempts - 1) throw error;
      }
    }
  }

  async waitForLine(
    matcher: (line: string) => boolean,
    timeoutMs = 30000
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      if (!this.parser || !this.isOpen) {
        reject(new Error("Serial port not connected"));
        return;
      }

      const timeout = setTimeout(() => {
        this.parser.removeListener("data", dataHandler);
        reject(new Error("Tidak ada hasil dari tombol ESP32"));
      }, timeoutMs);

      const dataHandler = (data: string) => {
        const line = data.trim();
        if (!matcher(line)) return;
        clearTimeout(timeout);
        this.parser.removeListener("data", dataHandler);
        resolve(line);
      };

      this.parser.on("data", dataHandler);
    });
  }

  async sendCommandUntil(command: string, endToken?: string): Promise<string> {
    return new Promise((resolve, reject) => {
      if (!this.port || !this.isOpen) {
        reject(new Error("Serial port not connected"));
        return;
      }

      let responseReceived = false;

      const timeout = setTimeout(() => {
        if (this.parser) {
          this.parser.removeListener("data", dataHandler);
        }
        if (!responseReceived) {
          reject(new Error("No response from Arduino"));
        }
      }, 10000); // 10 second timeout for response

      const dataHandler = (data: string) => {
        const line = data.trim();
        if (endToken && !line.startsWith(endToken)) {
          return;
        }
        responseReceived = true;
        clearTimeout(timeout);
        if (this.parser) this.parser.removeListener("data", dataHandler);
        resolve(line);
      };

      if (this.parser) this.parser.on("data", dataHandler);

      // Send command to Arduino
      this.port.write(command + "\n", (err: any) => {
        if (err) {
          clearTimeout(timeout);
          if (this.parser) {
            this.parser.removeListener("data", dataHandler);
          }
          reject(new Error(`Failed to send command: ${err.message}`));
        }
      });
    });
  }

  isConnected(): boolean {
    return this.isOpen;
  }
}

// Create singleton instance
let serialInstance: SerialCommunication | null = null;

export function getSerialInstance(): SerialCommunication {
  if (!serialInstance) {
    serialInstance = new SerialCommunication();
  }
  return serialInstance;
}

export function getSerialModuleError(): string | null {
  return serialModuleError;
}

export function getSerialConnectionError(): string | null {
  return serialConnectionError;
}

export async function testSerialConnection(config: SerialConfig): Promise<boolean> {
  if (!SerialPort || !ReadlineParser) {
    console.error("Serialport modules not available");
    return false;
  }

  const serial = new SerialCommunication();
  try {
    const connected = await serial.connect(config);
    if (connected) {
      // Try sending a simple test command
      try {
        await serial.sendCommand("TEST");
        await serial.disconnect();
        return true;
      } catch {
        // Even if test command fails, connection worked
        await serial.disconnect();
        return true;
      }
    }
    return false;
  } catch (error) {
    console.error("Serial connection test failed:", error);
    return false;
  }
}
