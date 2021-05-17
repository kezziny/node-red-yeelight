var yeelight = require("yeelight2");

let RED;
const state = module.exports = function (red) {
	RED = red;
	red.nodes.registerType("yeelight", Yeelight);
}

class Yeelight {

	constructor(config) {
		RED.nodes.createNode(this, config);
		this.config = config;

		this.pollTimer = null;
		this.reconnectTimer = null;

		this.on("input", (msg) => { this.handleInput(msg); });
		this.on('close', function () {
			if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
			if (this.pollTimer) clearInterval(this.pollTimer);
		});

		this.Connect();
	}

	Connect() {
		this.reconnectTimer = null;
		this.status({ fill: "red", shape: "ring", text: "" });

		this.yeelight = new yeelight(this.config.ip, 55443);
		this.yeelight.on("error", (error) => {
			console.log(error);
			if (this.pollTimer) { clearInterval(this.pollTimer); this.pollTimer = null; }
			if (!this.reconnectTimer) this.reconnectTimer = setTimeout(() => { this.Connect(); }, 60 * 1000);
		});

		this.yeelight.on("props", (p, d) => { this.onYeelightUpdate(p); });

		this.Poll();
		this.pollTimer = setInterval(() => { this.Poll(); }, 10 * 60 * 1000);
	}

	Poll() {
		this.yeelight.command("get_prop", ["power", "bright", "ct", "active_mode", "nl_br"])
			.then(data => { this.onYeelightUpdate(data); })
			.catch(err => {
				if (this.pollTimer) { clearInterval(this.pollTimer); this.pollTimer = null; }
				if (!this.reconnectTimer) this.reconnectTimer = setTimeout(() => { this.Connect(); }, 60 * 1000);
				this.send({ payload: { "connected": false } });
			});
	}

	onYeelightUpdate(p) {
		var state = { "connected": true };

		if (p.hasOwnProperty("power")) state.power = p.power == "on";
		if (p.hasOwnProperty("active_mode")) state.mode = p.active_mode == "0" ? "day" : "night";
		if (p.hasOwnProperty("nl_br") && state.mode === "night") this.newState.brightness = parseInt(p.nl_br);
		if (p.hasOwnProperty("bright")) state.brightness = parseInt(p.bright);
		if (p.hasOwnProperty("ct")) state.kelvin = parseInt(p.ct);


		this.status({ fill: "green", shape: "dot", text: JSON.stringify(state) });
		this.send({ payload: state });

	}

	handleInput(msg) {
		let data = msg.payload;

		if (data.hasOwnProperty("power")) {

			this.yeelight.command("set_power", [data.power ? "on" : "off", "smooth", 500, data.mode == "night" ? 5 : 1]).catch(err => { console.log(err); this.Poll(); });
		}

		if (data.hasOwnProperty("brightness")) {
			newState.brightness = data.brightness;
			this.yeelight.set_bright(newState.brightness).catch(err => { console.log(err); this.Poll(); });
		}

		if (data.hasOwnProperty("kelvin")) {
			newState.kelvin = data.kelvin;
			this.yeelight.set_ct(data.kelvin).catch(err => { console.log(err); this.Poll(); });
		}
	}
}

