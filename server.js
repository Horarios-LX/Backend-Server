const express = require("express")
const WebSocket = require('ws');
const fs = require("fs")

const wss = new WebSocket.Server({ port: 8082 });

let log = ""

let { spawn, exec } = require("node:child_process")

const sc = spawn("cloudflared", ["tunnel", "--url", "http://localhost:8080", "--no-autoupdate", "-logfile", "/dev/null"]) // server cloudflare

const wc = spawn("cloudflared", ["tunnel", "--url", "http://localhost:8079", "--no-autoupdate", "-logfile", "/dev/null"]) // wss cloudflare

const ogConsoleLog = console.log;

console.log = (...args) => {
    ogConsoleLog(...args)
    
    log = log + (log === "" ? "" : "\\n") + args.join(" ")
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({ logs: log, type: "console" }));
        }
    });
    
}

let domain;

let domain2;

const client = require("./client/")

client.login()

let app = express()

app.get("/analytics.json", (_, s) => {
    s.sendFile(__dirname + "/data/analytics.json")
})

app.get("/domain", (_, s) => {
    if (!domain) return s.json({ link: "" });
    s.json({ link: domain })
})

app.get("/domain2", (_, s) => {
    if (!domain2) return s.json({ link: "" });
    s.json({ link: domain2 })
})

app.get("/services", (_, s) => {
    s.sendFile(__dirname + "/public/services.html")
})

app.get("/log", (_, s) => {
    s.send(log)
})

app.get("/public/:file", (r, s) => {
    s.sendFile(__dirname + "/public/" + r.params.file)
})

app.get("/", (_, s) => {
    s.sendFile(__dirname + "/public/index.html")
})

let serverProcess = spawn("node", ["index.js"])

app.get("/pull", (_, s) => {
    s.sendStatus(200)
    serverProcess.kill()
    console.log("Shutting down server.js module...")
    console.log("Pulling from github...")
    exec("chmod +x pull.sh")
    let pull = spawn("git", ["pull", "git@github.com:Horarios-LX/Backend-Server.git"])
    pull.stderr.on("data", (d) => console.log("[GitHub ERR] " + d))
    pull.stdout.on("data", (d) => console.log("[GitHub INFO] " + d))
    pull.stdout.on("close", () => {
        console.log("Pull complete! Restarting server...")
        serverProcess = spawn("node", ["index.js"])
        serverProcess.stderr.on("data", (data) => {
            console.log("[Server.js ERR] " + data)
        })

        serverProcess.stdout.on("data", (data) => {
            console.log("[Server.js INFO] " + data)
        })
    })
})


app.get("/restart", (_, s) => {
    s.sendStatus(200)
    serverProcess.kill()
    console.log("Restarting server.js module...")
    setTimeout(() => {
        serverProcess = spawn("node", ["index.js"])
        serverProcess.stderr.on("data", (data) => {
            console.log("[Server.js ERR] " + data)
        })

        serverProcess.stdout.on("data", (data) => {
            console.log("[Server.js INFO] " + data)
        })
    }, 1000)
})

serverProcess.stderr.on("data", (data) => {
    console.log("[Server.js ERR] " + data)
})

serverProcess.stdout.on("data", (data) => {
    console.log("[Server.js INFO] " + data)
})


sc.stderr.on("data", (data) => {
    if (data.toString().includes(".trycloudflare.com")) {
        domain = "https://" + (data.toString().split(".trycloudflare.com")[0]).split("https://")[1] + ".trycloudflare.com"
        console.log("Server's public on " + domain)
        wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({ domain: domain, type: "cloudflared" }));
            }
        });
    }
})

wc.stderr.on("data", (data) => {
    if (data.toString().includes(".trycloudflare.com")) {
        domain2 = "https://" + (data.toString().split(".trycloudflare.com")[0]).split("https://")[1] + ".trycloudflare.com"
        console.log("Server's public on " + domain2)
        wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({ domain: domain2, type: "cloudflared2" }));
            }
        });
    }
})


process.on("exit", () => {
    serverProcess.kill()
    cloudflared.kill()
})

app.listen("8081", () => console.log("INTERNAL Server's ready on localhost:8081"))