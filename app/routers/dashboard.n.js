const express = require("express");
const util = require("../util.n.js");
const User = require("../models/user.n.js");
const Device = require("../models/device.n.js");

const router = express.Router();

router.use((req, res, next) => {
	req.app.locals.user = req.user;
	req.app.locals.activeNav = (page) => {
		if (
			page.includes("*")
				? req.path.startsWith(page.replace("*", ""))
				: req.path == page
		) {
			return "block px-3 py-2 text-white bg-blue-700 rounded md:bg-transparent md:text-blue-700 md:p-0 dark:text-white md:dark:text-blue-500";
		} else {
			return "block px-3 py-2 text-gray-900 rounded hover:bg-gray-100 md:hover:bg-transparent md:border-0 md:hover:text-blue-700 md:p-0 dark:text-white md:dark:hover:text-blue-500 dark:hover:bg-gray-700 dark:hover:text-white md:dark:hover:bg-transparent";
		}
	};
	next();
});

router.use('/devices', util.ensureAdmin);

// Dashboard route
router.get("/", (req, res) => {
	Device.find({})
		.then((devices) => {
			res.render("index", { devices: devices });
		})
		.catch((err) => {
			console.error(err);
			res.status(500).send("Internal server error");
		});
});

router.get("/devices", (req, res) => {
	Device.find({})
		.then((devices) => {
			res.render("devices/list", { devices: devices });
		})
		.catch((err) => {
			console.error(err);
			res.status(500).send("Internal server error");
		});
});

router.get("/devices/add", (req, res) => {
	res.render("devices/add");
});

router.get("/devices/:id/edit", (req, res) => {
	Device.findById(req.params.id.toString())
		.then((device) => {
			if (!device) {
				res.status(404).send("Device not found");
			} else {
				res.render("devices/edit", { device: device });
			}
		})
		.catch((err) => {
			console.error(err);
			res.status(500).send("Internal server error");
		});
});

router.get("/settings", util.ensureAdmin, (req, res) => {
	User.find({})
		.then((users) => {
			res.render("settings", { users: users });
		})
		.catch((err) => {
			console.error(err);
			res.status(500).send("Internal server error");
		});
});

module.exports = router;
