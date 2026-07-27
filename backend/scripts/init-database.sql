-- Database initialization script for International Trade CRM
-- Run this script to create the database and user

-- Create database
CREATE DATABASE IF NOT EXISTS international_trade_crm CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Create user (adjust credentials as needed)
-- CREATE USER IF NOT EXISTS 'crm_user'@'localhost' IDENTIFIED BY 'your_password';
-- GRANT ALL PRIVILEGES ON international_trade_crm.* TO 'crm_user'@'localhost';
-- FLUSH PRIVILEGES;

-- Use the database
USE international_trade_crm;

-- Tables will be created automatically by TypeORM when synchronize: true
-- Or you can use migrations for production

-- Initial admin user (password: admin123 - change this in production!)
-- INSERT INTO users (username, password_hash, created_at, updated_at)
-- VALUES ('admin', '$2b$10$YourHashedPasswordHere', NOW(), NOW());