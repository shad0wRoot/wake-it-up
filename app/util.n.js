const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const winston = require("winston");
const express = require("express");
const Device = require("./models/device.n.js");
const mqtt = require("mqtt");
const pingus = require("pingus");

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
 * Initialize the MQTT client.
 * @param {object} config - The configuration object.
 * @param {winston.Logger} logger - The logger object.
 */
function initMqtt(config, logger) {
	const brokerUrl = config.mqtt.broker_url;
	const options = {
		clientId: config.mqtt.client_id,
		clean: config.mqtt.clean_session,
		reconnectPeriod: config.mqtt.reconnect_period,
		connectTimeout: config.mqtt.connect_timeout,
		keepalive: config.mqtt.keepalive,
	};

	if (config.mqtt.enable_auth) {
		options.username = config.mqtt.username;
		options.password = config.mqtt.password;
	}

	const errTopic = config.mqtt.topics.error || "error";
	const infoTopic = config.mqtt.topics.info || "info";
	const wolTopic = config.mqtt.topics.wol || "wol";
	const solTopic = config.mqtt.topics.sol || "sol";

	// Create MQTT client
	const client = mqtt.connect(brokerUrl, options);

	// Handle successful connection
	client.on("connect", () => {
		logger.info("Connected to MQTT broker");

		// Subscribe to a topic
		client.subscribe(wolTopic, (err) => {
			if (!err) {
				logger.info("Subscribed to wol topic");
			}
		});

		client.subscribe(solTopic, (err) => {
			if (!err) {
				logger.info("Subscribed to sol topic");
			}
		});

		// Publish a message
		client.publish(infoTopic, "Wake-It-Up client connected and logged in");
	});

	// Handle incoming messages
	client.on("message", (topic, message) => {
		logger.info(
			`Received message: ${message.toString()} on topic: ${topic}`
		);
		let mqttName = message.toString();

		if (!mqttName) {
			logger.warn("Received empty message on topic:", topic);
			return;
		}
		switch (topic) {
			case wolTopic:
				if (mqttName === "all") {
					Device.find()
						.then((devices) => {
							devices.forEach((device) => {
								if (device.disabled) return;
								pingus
									.wol(device.mac)
									.then((result) => {
										logger.info(
											'WOL sent to device "' +
												device.name +
												'"'
										);
										client.publish(infoTopic, "WOL sent to device: " + device.name);
									})
									.catch((err) => {
										logger.error(err);
										client.publish(errTopic, err.message);
									});
							});
						})
						.catch((err) => {
							logger.error(err);
							client.publish(errTopic, "Internal server error");
						});
					client.publish(infoTopic, "WOL sent to all devices");
				} else {
					Device.findOne({ mqttName }).then((device) => {
						if (!device || device.disabled) {
							logger.error("Device not found: " + mqttName);
							client.publish(
								errTopic,
								"Device not found: " + mqttName
							);
						} else {
							pingus
								.wol(device.mac)
								.then((result) => {
									logger.info(
										'WOL sent to device "' +
											device.name +
											'"'
									);
									client.publish(
										infoTopic,
										"WOL sent to device: " + device.name
									);
								})
								.catch((err) => {
									logger.error(err);
									client.publish(errTopic, err.message);
								});
						}
					});
				}
				break;
			case solTopic:
				Device.findOne({ mqttName }).then((device) => {
					if (!device || device.disabled) {
						logger.error("Device not found: " + mqttName);
						client.publish(
							errTopic,
							"Device not found: " + mqttName
						);
					} else {
						pingus
							.sol(generateSolMacAddr(device.mac))
							.then((result) => {
								logger.info(
									'SOL sent to device "' + device.name + '"'
								);
								client.publish(
									infoTopic,
									"SOL sent to device: " + device.name
								);
							})
							.catch((err) => {
								logger.error(err);
								client.publish(errTopic, err.message);
							});
					}
				});
				break;
			default:
				logger.warn("Unknown topic:", topic);
				break;
		}
	});

	// Handle connection errors
	client.on("error", (err) => {
		logger.error("MQTT error:", err);
	});

	// Handle disconnection and auto-retry
	client.on("offline", () => {
		logger.warn("MQTT client is offline, attempting to reconnect...");
	});

	client.on("reconnect", () => {
		logger.info("Reconnecting to MQTT broker...");
	});

	// Handle when the client is closed
	client.on("close", () => {
		logger.info("Connection closed, retrying...");
	});
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
	initMqtt,
	restartApp,
};
