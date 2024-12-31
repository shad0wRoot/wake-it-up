const express = require("express");
const mongoose = require("mongoose");
const passport = require("passport");
const OAuth2Strategy = require("passport-oauth2");
const session = require("express-session");
const bodyParser = require("body-parser");
const fs = require("fs");
const yaml = require("js-yaml");
const path = require("path");
const util = require("./util.n.js");
const MongoStore = require("connect-mongo");
const expressLayouts = require("express-ejs-layouts");
const jwt = require("jsonwebtoken");

const dashboardRouter = require("./routers/dashboard.n.js");
const apiRouter = require("./routers/api.n.js");

const User = require("./models/user.n.js");

const logger = util.getLogger();

logger.info("Logger initialized");

var config;
var configPath;

try {
	const dataDir = util.getDataFilePath("");
	if (!fs.existsSync(dataDir)) {
		fs.mkdirSync(dataDir);
		logger.info("Created 'data' directory");
	}
	const logsDir = util.getDataFilePath("logs");
	if (!fs.existsSync(logsDir)) {
		fs.mkdirSync(logsDir);
		logger.info("Created 'logs' directory in data directory");
	}
} catch (e) {
	logger.error("Failed to create data or log directory:", e);
	process.exit(1);
}

try {
	const configPaths = [
		util.getDataFilePath("conf.yml"),
		util.getDataFilePath("config.yml"),
		util.getDataFilePath("conf.yaml"),
		util.getDataFilePath("config.yaml"),
	];

	let configFile = "";

	for (configPath of configPaths) {
		if (fs.existsSync(configPath)) {
			configFile = fs.readFileSync(configPath, "utf8");
			config = yaml.load(configFile);
			break;
		}
	}

	if (configFile.length === 0) {
		const defaultConfigPath = path.join(__dirname, "misc", "default.yml");
		if (fs.existsSync(defaultConfigPath)) {
			let defConf = fs.readFileSync(defaultConfigPath, "utf8");
			logger.info("Writing default configuration to 'data/conf.yml'");
			fs.writeFileSync(util.getDataFilePath("conf.yml"), defConf);
		} else {
			throw new Error(
				"No configuration file found and no default configuration available."
			);
		}
	}

	if (!config || Object.keys(config).length === 0) {
		throw new Error("No valid configuration found.");
	}
} catch (e) {
	logger.error("Failed to load configuration:", e);
	process.exit(1);
}

logger.info("Configuration loaded from: '" + configPath + "'");

const app = express();

// MongoDB connection
mongoose.connect(config.mongo_url);

// Session store
app.use(
	session({
		secret: util.getSessionSecret(),
		resave: false,
		saveUninitialized: true,
		store: MongoStore.create({
			mongoUrl: config.mongo_url,
			collectionName: "sessions",
			ttl: config.auth.session_length || 14 * 24 * 60 * 60, // default to 14 days if not specified
		}),
	})
);

// Middleware
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.set("layout", "layouts/dashboard");
app.use(expressLayouts);
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(passport.initialize());
app.use(passport.session());

app.use((req, res, next) => {
	res.locals.ping_interval = config.ping_interval || 5000;
	next();
});
app.use(express.static(path.join(__dirname, "public")));
app.use("/dashboard", util.ensureLoggedIn, dashboardRouter);
app.use("/api", util.ensureLoggedIn, apiRouter);

// Passport OAuth2 strategy
passport.use(
	new OAuth2Strategy(
		{
			scope: config.auth.oauth2.scope.split(" "),
			authorizationURL: config.auth.oauth2.authorization_url,
			tokenURL: config.auth.oauth2.token_url,
			clientID: config.auth.oauth2.client_id,
			clientSecret: config.auth.oauth2.client_secret,
			callbackURL:
				config.base_url.replace(/\/$/, "") + "/auth/oauth2/callback",
		},
		async (accessToken, refreshToken, params, profile, done) => {
			try {
				let userData = Object.keys(profile).length
					? profile
					: jwt.decode(params.id_token) || {};
				let user = await User.findOne({
					oauthID: userData.id || userData.sub,
				});
				if (!user) {
					let userCount = await User.countDocuments({});
					user = new User({
						oauthID: userData.id || userData.sub,
						name:
							userData.displayName ||
							userData.name ||
							userData.username ||
							userData.email ||
							`User ${userCount + 1}`,
						created: Date.now(),
						role: userCount === 0 ? "admin" : "user",
					});
					await user.save();
				}
				return done(null, user);
			} catch (err) {
				return done(err);
			}
		}
	)
);

passport.serializeUser((user, done) => {
	done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
	try {
		const user = await User.findById(id);
		done(null, user);
	} catch (err) {
		done(err);
	}
});

// Routes
app.get("/", async (req, res) => {
	if (req.isAuthenticated()) res.redirect("/dashboard");
	else {
		try {
			let userCount = await User.countDocuments({});
			if (userCount === 0) {
				res.render("login", {
					layout: false,
					auth: config.auth,
					alert: {
						warning:
							"Welcome! Please sign in to create an admin user.",
					},
				});
			} else {
				res.render("login", {
					layout: false,
					auth: config.auth,
				});
			}
		} catch (err) {
			if (err) {
				logger.error(err);
				return res.status(500).send("Internal server error");
			}
		}
	}
});

app.get("/auth/oauth2", passport.authenticate("oauth2"));

app.get(
	"/auth/oauth2/callback",
	passport.authenticate("oauth2", {
		failureRedirect: "/",
		successRedirect: "/dashboard",
	})
);

app.get("/profile", (req, res) => {
	if (!req.isAuthenticated()) {
		return res.redirect("/");
	}
	res.send(`Hello, ${req.user.name}`);
});

app.get("/auth/logout", (req, res) => {
	req.logout(null, () => {
		res.redirect("/");
	});
});

// Error handling
app.use((err, req, res, next) => {
	logger.error(err.stack);
	res.status(500).send("Internal server error");
});

process.on("uncaughtException", (err) => {
	logger.error("There was an uncaught error:", err);
	logger.warn("Restarting! (crash)");
	util.restartApp();
});

process.on("unhandledRejection", (reason, promise) => {
	logger.error("Unhandled Rejection at:", promise, "reason:", reason);
	logger.warn("Restarting! (crash)");
	util.restartApp();
});

// Start server
const PORT = config.server.port || 80;
const LISTEN_ADDR = config.server.listen_address || "0.0.0.0";
app.listen(PORT, LISTEN_ADDR, () => {
	logger.info(
		`server is running on address '${LISTEN_ADDR}' port '${PORT}' with base url '${config.base_url}'`
	);
});
