import {
	LitElement,
	html,
	css,
} from "https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js";

class WIUUpdater extends LitElement {
	static properties = {
		response: { type: String },
		url: { type: String },
		interval: { type: Number },
	};

	constructor() {
		super();
		this.response = "LOADING";
		this.interval = 5000;
		this.url = "";
	}

	connectedCallback() {
		super.connectedCallback();
		this.fetchData();
		this.startRefreshing();
	}

	async fetchData() {
		try {
			const response = await fetch(this.url);
			if (!response.ok) throw new Error("Network response was not ok");
			this.response = await response.text();
		} catch (error) {
			console.error("Fetch error:", error);
			this.response = "UNKNOWN"; // Set error message
		}
	}

	startRefreshing() {
		setInterval(() => {
			this.fetchData();
		}, this.interval);
	}

	render() {
		return html` <span>${this.response}</span> `;
	}
}

customElements.define("wiu-updater", WIUUpdater);
