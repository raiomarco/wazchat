import { Elysia, t } from "elysia";
import qrcode from "qrcode-terminal";
import { Client, LocalAuth } from "whatsapp-web.js";

// create user on db
function createUser(userID: string) {
	return {
		name: userID,
		status: 0, // 0 = unknown/done, 1 = menu, 2 = queue, 3 = attending
		messages: [],
	};
}

const db = new Map<
	string,
	{ name: string; status: number; messages: string[] }
>();

function getOrCreateUser(userID: string): {
	name: string;
	status: number;
	messages: string[];
} {
	if (!db.has(userID)) {
		db.set(userID, createUser(userID));
	}
	return db.get(userID) as unknown as {
		name: string;
		status: number;
		messages: string[];
	};
}

function updateUser(
	userID: string,
	user: { name: string; status: number; messages: string[] },
) {
	db.set(userID, user);
}

// Create a new client instance
const client = new Client({
	authStrategy: new LocalAuth(),
});

// When the client is ready, run this code (only once)
client.once("ready", () => {
	console.log("Client is ready!");
});

// When the client received QR-Code
client.on("qr", (qr) => {
	qrcode.generate(qr, { small: true });
});

client.on("message_create", (message) => {
	if (message.fromMe) return;

	const user = getOrCreateUser(message.from);

	if (user.status === 0) {
		const toSend = "<Menu>";
		user.status = 1;
		client.sendMessage(message.from, toSend);
		user.messages = [toSend];
		updateUser(message.from, user);
	} else if (user.status === 1) {
		if (message.body === "1") {
			const toSend = "<Queue>";

			user.status = 2;
			client.sendMessage(message.from, toSend);
			user.messages.push(toSend);
			updateUser(message.from, user);
		} else {
			const toSend = "?";
			client.sendMessage(message.from, toSend);
			user.messages.push(toSend);
			updateUser(message.from, user);
		}
	} else if (user.status === 2) {
		if (message.body === "!SELECTED") {
			const toSend = "<Attending>";
			user.status = 3;
			client.sendMessage(message.from, toSend);
			user.messages.push(toSend);
			updateUser(message.from, user);
		}
	} else if (user.status === 3) {
		if (message.body === "!DONE") {
			user.status = 0;
			client.sendMessage(message.from, "<END>");
			user.messages = [];
			updateUser(message.from, user);
		} else {
			client.sendMessage(message.from, message.body);
			user.messages.push(message.body);
			updateUser(message.from, user);
		}
	}
});

// Start your client
client.initialize();

const app = new Elysia();
app.get("/", "Hello Elysia");
app.get("/users", () => Array.from(db.keys()));
app.get("/users/:id/", ({ params: { id } }) => db.get(id));
app.post(
	"/users/:id/message",
	({ params: { id }, body: { message } }) => client.sendMessage(id, message),
	{
		body: t.Object({
			message: t.String({ minLength: 1 }),
		}),
	},
);
app.listen(3000);
