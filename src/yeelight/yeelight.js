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

        this.state = {
            "connected": null,
            "power": null,
            "mode": null,
            "brightness": null,
            "kelvin": null,
            "external": null,
        };

        this.newState = {};


        this.pollTimer = null;
        this.reconnectTimer = null;
        this.debounceTimer = null;


        this.on("input", (msg) => { this.handleInput(msg); });
        this.on('close', function () {
            if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
            if (this.pollTimer) clearInterval(this.pollTimer);
        });

        this.Connect();
    }

    Connect() {
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
            .then(data => { this.onYeelightPoll(data); })
            .catch(err => {
                if (this.pollTimer) { clearInterval(this.pollTimer); this.pollTimer = null; }
                if (!this.reconnectTimer) this.reconnectTimer = setTimeout(() => { this.Connect(); }, 60 * 1000);

                if (this.state.connected) {
                    this.status({ fill: "red", shape: "ring", text: "" });

                    this.state.connected = false;
                    this.send({ payload: this.state });
                }
            });
    }


    onYeelightPoll(data) {
        let newState = {
            "connected": true,
            "power": data.result[0] === "on",
            "mode": data.result[3] === "0" ? "day" : "night",
            "brightness": data.result[3] === "0" ? parseInt(data.result[1]) : parseInt(data.result[4]),
            "kelvin": parseInt(data.result[2]),
            "external": false
        }

        this.status({
            fill: "green",
            shape: "dot",
            text: JSON.stringify(newState)
        });

        this.state = newState;
        this.send({ payload: this.state });

    }

    onYeelightUpdate(p) {
        if (this.debounceTimer === null) {
            this.newState = Object.assign({}, this.state);
            this.newState.connected = true;
        }

        if (p.hasOwnProperty("power")) this.newState.power = p.power == "on";
        if (p.hasOwnProperty("active_mode")) this.newState.mode = p.active_mode == "0" ? "day" : "night";
        if (p.hasOwnProperty("nl_br") && this.newState.mode === "night") this.newState.brightness = parseInt(p.nl_br);
        if (p.hasOwnProperty("bright")) this.newState.brightness = parseInt(p.bright);
        if (p.hasOwnProperty("ct")) this.newState.kelvin = parseInt(p.ct);

        if (this.debounceTimer !== null) {
            clearTimeout(this.debounceTimer);
        }
        this.debounceTimer = setTimeout(() => {
            this.debounceTimer = null;
            if (JSON.stringify(this.state) !== JSON.stringify(this.newState)) {
                this.newState.external = true;
                this.state = this.newState;

                this.status({ fill: "green", shape: "dot", text: JSON.stringify(this.state) });
                this.send({ payload: this.state });
            }
        }, 200);

    }

    handleInput(msg) {
        let data = msg.payload;
        let newState = Object.assign({}, this.state);

        if (data.hasOwnProperty("power") || data.hasOwnProperty("power")) {
            if (data.hasOwnProperty("power")) {
                newState.power = data.power;
            }

            if (data.hasOwnProperty("mode")) {
                newState.mode = data.mode;
            }

            this.yeelight.command("set_power", [newState.power ? "on" : "off", "smooth", 500, data.mode == "night" ? 5 : 1]).catch(err => { console.log(err); this.Poll(); });
        }

        if (data.hasOwnProperty("brightness")) {
            newState.brightness = data.brightness;
            this.yeelight.set_bright(newState.brightness).catch(err => { console.log(err); this.Poll(); });
        }

        if (data.hasOwnProperty("kelvin")) {
            newState.kelvin = data.kelvin;
            this.yeelight.set_ct(data.kelvin).catch(err => { console.log(err); this.Poll(); });
        }

        if (JSON.stringify(this.state) !== JSON.stringify(newState)) {
            newState.external = false;
            this.state = newState;

            this.status({ fill: "green", shape: "dot", text: JSON.stringify(this.state) });
            this.send({ payload: this.state });
        }
    }
}

