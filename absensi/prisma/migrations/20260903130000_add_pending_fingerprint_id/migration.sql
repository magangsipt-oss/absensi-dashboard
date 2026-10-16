ALTER TABLE `employees`
ADD COLUMN `pendingFingerprintId` INT NULL;

CREATE UNIQUE INDEX `employees_pendingFingerprintId_key` ON `employees`(`pendingFingerprintId`);
