const mongoose = require("mongoose");

const deviceSchema = new mongoose.Schema({
  name: String,
  created: Date,
  mac: String,
  ip: String,
  supportsSOL: Boolean,
  disabled: Boolean,
});

const Device = mongoose.model("Device", deviceSchema);

module.exports = Device;
