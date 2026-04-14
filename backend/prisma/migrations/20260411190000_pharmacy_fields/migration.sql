-- AlterTable Medicine — retail pharmacy fields (SKU, strength, composition, etc.)
ALTER TABLE `Medicine` ADD COLUMN `sku` VARCHAR(64) NULL;
ALTER TABLE `Medicine` ADD COLUMN `strengthMg` DOUBLE NULL;
ALTER TABLE `Medicine` ADD COLUMN `strengthUnit` VARCHAR(10) NULL DEFAULT 'mg';
ALTER TABLE `Medicine` ADD COLUMN `strengthLabel` VARCHAR(80) NULL;
ALTER TABLE `Medicine` ADD COLUMN `composition` VARCHAR(500) NULL;
ALTER TABLE `Medicine` ADD COLUMN `packSize` VARCHAR(100) NULL;
ALTER TABLE `Medicine` ADD COLUMN `dosageForm` VARCHAR(50) NULL;

CREATE UNIQUE INDEX `Medicine_sku_key` ON `Medicine`(`sku`);

-- AlterTable BillItem — snapshot for GST invoice / print
ALTER TABLE `BillItem` ADD COLUMN `itemSku` VARCHAR(64) NULL;
ALTER TABLE `BillItem` ADD COLUMN `itemHsn` VARCHAR(20) NULL;
ALTER TABLE `BillItem` ADD COLUMN `itemStrength` VARCHAR(80) NULL;
ALTER TABLE `BillItem` ADD COLUMN `itemPack` VARCHAR(100) NULL;
ALTER TABLE `BillItem` ADD COLUMN `itemGeneric` VARCHAR(255) NULL;
