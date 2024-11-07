const token = require("../data/config.json").token
const Discord = require("discord.js")

let client = new Discord.Client({ intents: [Discord.Intents.FLAGS.GUILD_MESSAGES] })

const Database = require("../database")

let notes = new Database("./data/notes.json");

module.exports.notes = notes;

let { map, getVehicle } = require("../getVehicle.js")

const { SlashCommandBuilder } = require('@discordjs/builders');

const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v10');
const rest = new REST({ version: '10' }).setToken(token);
let notesCmd = new SlashCommandBuilder()
        .setName("notes")
        .setDescription("Adiciona, remove e vê as notas adicionadas aos veículos.")
        .addSubcommand(subcmd => 
            subcmd
                .setName('add')
                .setDescription('Adiciona uma nota a um veículo')
                .addStringOption(o =>
                    o.setName("bus")
                        .setDescription('ID do autocarro')
                        .setRequired(true)
                        .setAutocomplete(true)
                )
                .addStringOption(o => 
                    o.setName("note")
                        .setDescription("Nota")
                        .setRequired(true)
                )
        )
        .addSubcommand(subcmd => 
            subcmd
                .setName('list')
                .setDescription('Devolve todas as notas associadas a um veículo')
                .addStringOption(o =>
                    o.setName("bus")
                        .setDescription('ID do autocarro')
                        .setRequired(true)
                        .setAutocomplete(true)
                )
        )
        .addSubcommand(subcmd => 
            subcmd
                .setName('clear')
                .setDescription('Remove uma (ou várias) notas associadas a um veículo')
                .addStringOption(o =>
                    o.setName("bus")
                        .setDescription('ID do autocarro')
                        .setRequired(true)
                        .setAutocomplete(true)
                )
                .addStringOption(o =>
                    o.setName("note")
                        .setDescription('Nota a remover')
                        .setRequired(false)
                        .setAutocomplete(true)
                )
        )

client.on("ready", async () => {
    client.commands = new Discord.Collection()
    client.commands.set("notes", notesCmd)
    try {
        await rest.put(
            Routes.applicationGuildCommands(client.user.id, "1286100228008574986"), {
            body: [notesCmd]
        });
        console.log('Successfully registered application commands for guild');
    } catch (error) {
        if (error) console.error(error);
    }
    console.log("Bot's ready!")
})

client.on("interactionCreate", async (interaction) => {
    if (interaction.isAutocomplete()) {
        let choices = []
        let focusedOption = interaction.options.getFocused(true);
        if (focusedOption.name === "bus") {
            let content = interaction.options.getString("bus")
            choices = content != "" ? (notes.read("known_vehicles") ? notes.read("known_vehicles") : []).filter(a => a.startsWith(content)) : notes.read("known_vehicles");
            if(!choices) choices = []
            choices.sort((a, b) => a.localeCompare(b))
            choices = choices.slice(0, 25)
            try {
                interaction.respond(choices.map(c => ({ name: c + " (" + (getVehicle(c) || getVehicle(c)) + ")", value: c })))
            } catch (error) {
                console.error(error);
            }
        }
        if (focusedOption.name === "note" && interaction.commandName === "notes" && interaction.options.getSubcommand() === "clear") {
            let content = interaction.options.getString("note")
            let bus = interaction.options.getString("bus").split(" ")[0]
            let busNotes = notes.read(bus) || []
            let choices = []
            choices = content != "" ? busNotes.filter(a => a.startsWith(content)) : busNotes;
            choices.sort((a, b) => a.localeCompare(b))
            choices = choices.slice(0, 25)
            try {
                interaction.respond(choices.map(c => ({ name: c, value: busNotes.indexOf(c).toString() })))
            } catch (error) {
                console.error(error);
            }
        }
    }   
    if (interaction.isApplicationCommand()) {
        if (interaction.commandName === "notes") {
            let bus = interaction.options.getString("bus")
            if (!bus) return interaction.reply(":x: Veículo desconhecido")
            if(!(notes.read("known_vehicles") ? notes.read("known_vehicles") : []).includes(bus)) notes.push("known_vehicles", bus)
            if (interaction.options.getSubcommand() === "list") {
                let busNotes = notes.read(bus)
                if (!busNotes || busNotes.length === 0) return interaction.reply(":x: Este veículo não tem nenhuma anotação.");
                return interaction.reply("Anutações do veículo **" + bus.split("|")[1] + "** (" + (map(getVehicle(bus)) || getVehicle(bus)) + "): \n> " + busNotes.join("\n> "))
            }
            if (interaction.options.getSubcommand() === "add") {
                let busNotes = notes.read(bus) || []
                let note = interaction.options.getString("note")
                busNotes.push(note)
                notes.write(bus, busNotes)
                interaction.reply("Adicionado a seguinte anotação ao veículo **" + bus.split("|")[1] + "** (" + (map(getVehicle(bus)) || getVehicle(bus)) + "): \n> " + note)
            }
            if (interaction.options.getSubcommand() === "clear") {
                let busNotes = notes.read(bus) || []
                if (busNotes.length == 0) return interaction.reply(":x: Não existem anotações neste veículo.")
                let note = interaction.options.getString("note")
                if (!note) {
                    notes.delete(bus)
                    return interaction.reply("Removidas todas as anotações do veículo **" + bus.split("|")[1] + "** (" + (map(getVehicle(bus)) || getVehicle(bus)) + ")!")
                }
                if (isNaN(note)) return interaction.reply(":x: Nota desconhecida. (Expected number | Received `" + note + "`)")
                let removed = busNotes.splice(parseInt(note), 1)
                notes.write(bus, busNotes)
                return interaction.reply("Removida uma anotação do veículo **" + bus.split("|")[1] + "** (" + (map(getVehicle(bus)) || getVehicle(bus)) + "): \n> " + removed)
            }
        }
    }
})

module.exports.login = () => {
    client.login(token)
}