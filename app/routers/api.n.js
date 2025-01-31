const express = require("express");
const User = require("../models/user.n.js");
const Device = require("../models/device.n.js");
const pingus = require("pingus");
const util = require("../util.n.js");

const router = express.Router();

const logger = util.getLogger();

router.use("/admin", util.ensureAdmin);

router.post("/admin/devices/:id/edit", (req, res) => {
	let rb = req.body;
	Device.findByIdAndUpdate(req.params.id.toString(), {
		name: rb.name,
		mac: rb.mac,
		ip: rb.ip,
		supportsSOL: rb.supportsSOL === "true",
		disabled: rb.disabled === "true",
		mqttName: rb.mqtt || undefined,
	})
		.then(() => {
			res.redirect("/dashboard/devices");
		})
		.catch((err) => {
			logger.error(err);
			res.status(500).send("Internal server error");
		});
});

router.post("/admin/devices/:id/delete", (req, res) => {
	Device.findByIdAndDelete(req.params.id.toString())
		.then(() => {
			res.redirect("/dashboard/devices");
		})
		.catch((err) => {
			logger.error(err);
			res.status(500).send("Internal server error");
		});
});

router.post("/admin/devices/add", (req, res) => {
	let rb = req.body;
	const device = new Device({
		name: rb.name,
		mac: rb.mac,
		ip: rb.ip,
		supportsSOL: rb.supportsSOL === "true",
		disabled: rb.disabled === "true",
		mqttName: rb.mqtt || undefined,
	});
	device
		.save()
		.then(() => {
			res.redirect("/dashboard/devices");
		})
		.catch((err) => {
			logger.error(err);
			res.status(500).send("Internal server error");
		});
});

router.post("/admin/user/:id/role", (req, res) => {
	User.findByIdAndUpdate(req.params.id.toString(), { role: req.body.role })
		.then(() => {
			res.redirect("/dashboard/settings");
		})
		.catch((err) => {
			logger.error(err);
			res.status(500).send("Internal server error");
		});
});

router.get("/status/:id", (req, res) => {
	Device.findById(req.params.id.toString()).then((device) => {
		if (!device || device.disabled) {
			res.status(404).send("Device not found");
		} else {
			pingus
				.icmp({
					host: device.ip,
				})
				.then((result) => {
					if (result.status == "reply") {
						res.status(200).send("UP");
					} else {
						res.status(200).send("DOWN");
					}
				})
				.catch((err) => {
					logger.error(err);
					res.status(500).send("Internal server error");
				});
		}
	});
});

router.post("/wol/:id", (req, res) => {
	if (req.params.id === "all") {
		Device.find()
			.then((devices) => {
				devices.forEach((device) => {
					if (device.disabled) return;
					pingus
						.wol(device.mac)
						.then((result) => {
							logger.info(
								'WOL sent to device "' + device.name + '"'
							);
						})
						.catch((err) => {
							logger.error(err);
						});
				});
			})
			.catch((err) => {
				logger.error(err);
			});
		res.status(200).send("WOL sent to all devices");
	} else {
		Device.findById(req.params.id.toString()).then((device) => {
			if (!device || device.disabled) {
				res.status(404).send("Device not found");
			} else {
				pingus
					.wol(device.mac)
					.then((result) => {
						logger.info('WOL sent to device "' + device.name + '"');
					})
					.catch((err) => {
						logger.error(err);
						res.status(500).send("Internal server error");
					});
			}
		});
	}
});

router.post("/sol/:id", (req, res) => {
	Device.findById(req.params.id.toString()).then((device) => {
		if (!device || device.disabled) {
			res.status(404).send("Device not found");
		} else if (!device.supportsSOL) {
			res.status(400).send("Device does not support SOL");
		} else {
			pingus
				.wol(util.generateSolMacAddr(device.mac))
				.then((result) => {
					logger.info('SOL sent to device "' + device.name + '"');
				})
				.catch((err) => {
					logger.error(err);
					res.status(500).send("Internal server error");
				});
		}
	});
});

router.get("/admin/debug/crash", (req, res) => {
	util.getLogger().warn("Crashing server for debugging purposes!");
	util.restartApp();
});

module.exports = router;
