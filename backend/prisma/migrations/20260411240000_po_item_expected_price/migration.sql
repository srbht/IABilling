-- Expected purchase rate on PO line (auto-filled from master; GRN can override)
ALTER TABLE `PurchaseOrderItem` ADD COLUMN `expectedPurchasePrice` DOUBLE NULL;
