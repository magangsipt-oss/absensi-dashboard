# Fingerprint Mapping Recovery Status

Updated: 2026-10-20

## Verified

- The AS608 sensor connected through ESP32 `192.168.1.109` currently contains template IDs 1 through 27.
- The production attendance dashboard now contains mapping rows for all 27 sensor IDs.
- Existing employee assignments for IDs 1 through 4 were preserved.
- IDs 5 through 27 are present as unassigned templates. Their employee names have not been inferred or changed.
- No fingerprint templates were deleted, enrolled again, or modified during the synchronization.

## Remaining work

- Verify the employee associated with each unassigned template before assigning a name.
- Resolve historical conflicts for existing mappings using a reliable source or supervised employee verification.
- Configure and verify automatic Railway database backups before future recovery operations.

## Data handling

- Database dumps, credentials, and personal employee records are intentionally excluded from this progress update.
- Sensor template IDs alone do not reveal employee identities.
