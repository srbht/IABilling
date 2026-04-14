-- India retail billing: patient / referral / place of supply + Schedule snapshot on lines
ALTER TABLE `Bill` ADD COLUMN `customerState` VARCHAR(100) NULL,
    ADD COLUMN `patientName` VARCHAR(255) NULL,
    ADD COLUMN `patientAge` VARCHAR(30) NULL,
    ADD COLUMN `referredByDoctor` VARCHAR(255) NULL,
    ADD COLUMN `doctorRegNo` VARCHAR(80) NULL,
    ADD COLUMN `rxReference` VARCHAR(120) NULL;

ALTER TABLE `BillItem` ADD COLUMN `itemSchedule` VARCHAR(50) NULL;
