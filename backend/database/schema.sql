SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS zoho_tokens, department_permissions, refresh_tokens, audit_logs, revoked_tokens,
  role_permissions, user_roles, permissions, roles, users;
SET FOREIGN_KEY_CHECKS = 1;

CREATE TABLE users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(150) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  department VARCHAR(100),
  status ENUM('Active','Inactive') NOT NULL DEFAULT 'Active',
  mfa_secret VARCHAR(255) NULL,
  mfa_enabled TINYINT(1) NOT NULL DEFAULT 0,
  auth_source ENUM('local','sso') NOT NULL DEFAULT 'local',
  last_login DATETIME NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE roles (
  id INT AUTO_INCREMENT PRIMARY KEY,
  role_name VARCHAR(50) NOT NULL UNIQUE
);

CREATE TABLE permissions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  permission_name VARCHAR(80) NOT NULL UNIQUE
);

CREATE TABLE user_roles (
  user_id INT NOT NULL,
  role_id INT NOT NULL,
  PRIMARY KEY (user_id, role_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE
);

CREATE TABLE role_permissions (
  role_id INT NOT NULL,
  permission_id INT NOT NULL,
  PRIMARY KEY (role_id, permission_id),
  FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
  FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE
);

-- Department-level access: every user in the department gets these extra permissions
CREATE TABLE department_permissions (
  department VARCHAR(100) NOT NULL,
  permission_id INT NOT NULL,
  PRIMARY KEY (department, permission_id),
  FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE
);

CREATE TABLE audit_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NULL,
  action VARCHAR(255) NOT NULL,
  status ENUM('SUCCESS','FAILED','DENIED') NOT NULL DEFAULT 'SUCCESS',
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- Logged-out access tokens (by jti)
CREATE TABLE revoked_tokens (
  jti VARCHAR(64) PRIMARY KEY,
  expires_at DATETIME NOT NULL
);

-- Rotating refresh tokens (only SHA-256 hashes are stored). A "family" = one login session.
CREATE TABLE refresh_tokens (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  token_hash CHAR(64) NOT NULL UNIQUE,
  family VARCHAR(36) NOT NULL,
  expires_at DATETIME NOT NULL,
  revoked TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX (family),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Zoho OAuth tokens, AES-256-GCM encrypted by the backend (single row)
CREATE TABLE zoho_tokens (
  id TINYINT PRIMARY KEY,
  refresh_token TEXT NOT NULL,
  access_token TEXT NULL,
  expires_at DATETIME NULL,
  connected_by INT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
