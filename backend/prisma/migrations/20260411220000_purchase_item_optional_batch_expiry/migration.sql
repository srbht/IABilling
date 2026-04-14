-- Batch/expiry often unknown at PO / order time; capture when stock is received.
ALTER TABLE `PurchaseItem` MODIFY COLUMN `batchNumber` VARCHAR(100) NULL,
    MODIFY COLUMN `expiryDate` DATETIME(3) NULL;
