const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
	oauthID: String,
	name: String,
	created: Date,
	role: { type: String, default: "user" },
});

const User = mongoose.model("User", userSchema);

module.exports = User;
