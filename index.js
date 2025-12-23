const {
  Client,
  GatewayIntentBits,
  SlashCommandBuilder,
  REST,
  Routes
} = require("discord.js");

const cron = require("node-cron");
const fs = require("fs");


// ===== CONFIG =====
const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const FILE = "./reminders.json";
const ALLOWED_ROLE = "ReminderAdmin";

// ===== CLIENT =====
const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

// ===== LOAD DATA =====
let reminders = fs.existsSync(FILE)
  ? JSON.parse(fs.readFileSync(FILE))
  : [];

const save = () =>
  fs.writeFileSync(FILE, JSON.stringify(reminders, null, 2));

// ===== SLASH COMMANDS =====
const commands = [
  new SlashCommandBuilder()
    .setName("nhac")
    .setDescription("Tạo lịch nhắc")
    .addUserOption(o =>
      o.setName("nguoi").setDescription("Người được nhắc").setRequired(true))
    .addStringOption(o =>
      o.setName("ngay").setDescription("YYYY-MM-DD").setRequired(true))
    .addStringOption(o =>
      o.setName("gio").setDescription("HH:mm").setRequired(true))
    .addIntegerOption(o =>
      o.setName("solan").setDescription("Số lần spam").setRequired(true))
    .addStringOption(o =>
      o.setName("noidung").setDescription("Nội dung").setRequired(true)),

  new SlashCommandBuilder()
    .setName("list")
    .setDescription("Xem danh sách lịch"),

  new SlashCommandBuilder()
    .setName("xoa")
    .setDescription("Xóa lịch")
    .addStringOption(o =>
      o.setName("id").setDescription("ID lịch").setRequired(true))
].map(c => c.toJSON());

// ===== REGISTER =====
const rest = new REST({ version: "10" }).setToken(TOKEN);
(async () => {
  await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
  console.log("Slash commands ready");
})();

// ===== READY =====
client.once("ready", () => {
  console.log(`Bot online: ${client.user.tag}`);
});

// ===== ROLE CHECK =====
function hasPermission(member) {
  return member.roles.cache.some(r => r.name === ALLOWED_ROLE);
}

// ===== INTERACTION =====
client.on("interactionCreate", async i => {
  if (!i.isChatInputCommand()) return;

  if (!hasPermission(i.member)) {
    return i.reply({ content: "❌ Không có quyền", ephemeral: true });
  }

  // /nhac
  if (i.commandName === "nhac") {
    const user = i.options.getUser("nguoi");
    const date = i.options.getString("ngay");
    const time = i.options.getString("gio");
    const note = i.options.getString("noidung");
    const solan = i.options.getInteger("solan");

    const start = new Date(`${date}T${time}:00+07:00`).getTime();
    const id = Date.now().toString();

    reminders.push({
      id,
      userId: user.id,
      channelId: i.channelId,
      note,
      nextTime: start,
      count: 0,
      max: solan
    });

    save();

    return i.reply(`✅ Đã tạo lịch ID **${id}**`);
  }

  // /list
  if (i.commandName === "list") {
    if (reminders.length === 0) {
      return i.reply("📭 Không có lịch");
    }

    return i.reply(
      reminders.map(r =>
        `🆔 ${r.id} | <@${r.userId}> | ${r.count}/${r.max}`
      ).join("\n")
    );
  }

  // /xoa
  if (i.commandName === "xoa") {
    const id = i.options.getString("id");
    const before = reminders.length;
    reminders = reminders.filter(r => r.id !== id);
    save();

    return i.reply(
      before === reminders.length
        ? "❌ Không tìm thấy ID"
        : `✅ Đã xóa ${id}`
    );
  }
});

// ===== CRON =====
cron.schedule("* * * * *", async () => {
  const now = Date.now();

  for (const r of reminders) {
    if (now >= r.nextTime && r.count < r.max) {
      const channel = await client.channels.fetch(r.channelId);
      channel.send(
  `@everyone ⏰ <@${r.userId}> **${r.note}** (${r.count + 1}/${r.max})`
);

      r.count++;
      r.nextTime = now + 60 * 1000;
    }
  }

  reminders = reminders.filter(r => r.count < r.max);
  save();
});

client.login(TOKEN);
