const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const winston = require("winston");
const express = require("express");

/**
 * Get the absolute path to a file in the application data directory.
 * @param {string} path relative path to file in application data directory
 * @returns {string} absolute path to file in application data directory
 */
var getDataFilePath = (file) => {
	return path.join(__dirname, "../data", file);
};

/**
 * Get a logger instance.
 * @returns {winston.Logger} logger instance
 */
var getLogger = () => {
	let alignColorsAndTime = winston.format.combine(
		winston.format.colorize({
			all: true,
		}),
		winston.format.label({
			label: "[Wake-It-Up]",
		}),
		winston.format.timestamp(),
		winston.format.printf(
			(info) =>
				`${info.label}  ${info.timestamp}  ${info.level}: ${info.message}`
		),
		winston.format.colorize({ all: true })
	);

	return winston.createLogger({
		level: "debug",
		format: winston.format.combine(
			//winston.format.colorize(),
			winston.format.timestamp(),
			winston.format.printf(({ timestamp, level, message }) => {
				return `${timestamp} ${level}: ${message}`;
			})
		),
		transports: [
			new winston.transports.Console({
				format: winston.format.combine(
					winston.format.colorize(),
					alignColorsAndTime
				),
			}),
			new winston.transports.File({ filename: "data/logs/app.log" }),
		],
		exceptionHandlers: [
			new winston.transports.File({ filename: "data/logs/error.log" }),
			new winston.transports.Console(),
		],
	});
};

/**
 * Middleware to ensure that a user is logged in.
 * @param {express.Request} req express request object
 * @param {express.Response} res express response object
 * @param {express.NextFunction} next express next function
 */
var ensureLoggedIn = (req, res, next) => {
	if (req.isAuthenticated()) return next();
	res.redirect("/");
};

/**
 * Middleware to ensure that a user is administrator.
 * @param {express.Request} req express request object
 * @param {express.Response} res express response object
 * @param {express.NextFunction} next express next function
 */
var ensureAdmin = (req, res, next) => {
	if (req.user && req.user.role === "admin") {
		return next();
	} else {
		return res.status(403).send("Forbidden");
	}
};

/**
 * Get the session secret from a file or generate a new one if it doesn't exist.
 * @returns {string} session secret
 */
var getSessionSecret = () => {
	const secretFilePath = getDataFilePath("session_secret.txt");

	if (!fs.existsSync(secretFilePath)) {
		const secret = crypto.randomBytes(64).toString("hex");
		fs.writeFileSync(secretFilePath, secret);
		return secret;
	} else {
		return fs.readFileSync(secretFilePath, "utf8");
	}
};

/**
 * Generates a Sleep-on-LAN (SoL) MAC address by reversing the order of the bytes in the original MAC address.
 * @param {string} macAddr - The original MAC address in the format AA:BB:CC:DD:EE:FF.
 * @returns {string} - The Sleep-on-LAN MAC address in reversed byte order.
 */
function generateSolMacAddr(macAddr) {
	// Split the MAC address into an array of bytes
	const macBytes = macAddr.split(":");

	// Reverse the order of the bytes
	const reversedMacBytes = macBytes.reverse();

	// Join the reversed bytes back into a MAC address string
	const solMacAddr = reversedMacBytes.join(":");

	return solMacAddr;
}

/**
 * Restart the server by writing a restart file.
 */
function restartApp() {
	setTimeout(() => {
		fs.writeFileSync(
			getDataFilePath("server.restart"),
			new Date().toISOString()
		);
	}, 1000);
}

module.exports = {
	getDataFilePath,
	getLogger,
	ensureLoggedIn,
	ensureAdmin,
	getSessionSecret,
	generateSolMacAddr,
	restartApp,
};
