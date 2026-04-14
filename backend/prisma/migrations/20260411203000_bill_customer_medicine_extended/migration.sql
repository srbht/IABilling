-- Bill: customer address snapshot for GST invoice
ALTER TABLE `Bill` ADD COLUMN `customerAddress` TEXT NULL,
ADD COLUMN `customerCity` VARCHAR(100) NULL,
ADD COLUMN `customerPincode` VARCHAR(10) NULL;

-- Customer: full address for autofill
ALTER TABLE `Customer` ADD COLUMN `state` VARCHAR(100) NULL,
ADD COLUMN `pincode` VARCHAR(10) NULL;

-- Medicine: retail / pharmacy tracking
ALTER TABLE `Medicine` ADD COLUMN `brandName` VARCHAR(255) NULL,
ADD COLUMN `requiresPrescription` BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN `defaultDiscountPct` DOUBLE NOT NULL DEFAULT 0,
ADD COLUMN `taxInclusive` BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN `notes` TEXT NULL,
ADD COLUMN `substituteMedicineIds` JSON NULL,
ADD COLUMN `supplierId` VARCHAR(191) NULL,
ADD COLUMN `lastPurchaseDate` DATETIME(3) NULL;

-- Bill line: rack at time of sale
ALTER TABLE `BillItem` ADD COLUMN `itemRackLocation` VARCHAR(100) NULL;

-- FK Medicine -> Supplier
ALTER TABLE `Medicine` ADD CONSTRAINT `Medicine_supplierId_fkey` FOREIGN KEY (`supplierId`) REFERENCES `Supplier`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
