const express = require("express")
const CMetropolitana = require("cmetropolitana.js")
const app = express()
const fs = require("fs")
const WebSocket = require('ws');

const wss = new WebSocket.Server({ port: 8079 });

wss.on('error', (error) => {
    console.log('WebSocket Error:', error);
});

let date = (new Date(Date.now())).toLocaleDateString()

let connections = {}

let randomId = () => Math.floor(Math.random() * 1000000).toString();;

wss.on('connection', (ws) => {
    ws.lastActive = Date.now();
    ws.interval = setInterval(() => {
        if (Date.now() > (ws.lastActive + 30 * 1000)) {
            clearInterval(ws.interval)
            ws.close()
        }
    }, 60 * 1000)
    ws.id = randomId();
    connections[ws.id] = ws;

    ws.on("close", () => {
        connections[ws.id] = null;
    })

    ws.on("message", async (msg) => {
        if (msg.toString() === "ping") return ws.lastActive = Date.now();
        msg.json = JSON.parse(msg.toString());
        if (msg.json.op === "10") {
            //op - op code | d - data | op code 10 - Switch to stop;
            ws.stopId = msg.json.d;
            ws.vehicleId = null;
            if (!CMetropolitana.stops.cache.get(ws.stopId)) {
                ws.stopId = null;
                ws.send("ERR")
                return;
            }
            if (!departuresCache[ws.stopId]) departuresCache[ws.stopId] = (await CMetropolitana.stops.cache.get(ws.stopId).departures(Date.now())).map(a => a.trip_id);
            ws.send("OK")
        } else if (msg.json.op === "20") {
            //op - op code | d - data | op code 20 - Switch to vehicle;
            ws.stopId = null;
            ws.vehicleId = msg.json.d;
            ws.send("OK")
        }
    })
})

const cors = require("cors")

app.use(cors({
    origin: '*',
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type'],
    credentials: true
}));

let departuresCache = {};

let positionCache = {};

let ready = false

let vehicles = {};

let notes = JSON.parse(fs.readFileSync(__dirname + "/data/notes.json"));

let stopsRemapped;

let schoolsRemapped;

let now = Math.round(Date.now() / 1000);

async function fetchAll() {
    await CMetropolitana.alerts.fetchAll();
    await CMetropolitana.lines.fetchAll();
    await CMetropolitana.routes.fetchAll();
    await CMetropolitana.stops.fetchAll().then(a => stopsRemapped = Object.values(CMetropolitana.stops.cache._cache).map(a => ({ id: a.id, lat: a.lat, lon: a.lon, name: a.name, lines: a.lines.map(b => ({ text: b, color: (CMetropolitana.lines.cache.get(b) || { color: "#000000" }).color })) })));
    await CMetropolitana.schools.fetchAll().then(a => schoolsRemapped = Object.values(CMetropolitana.schools.cache._cache).map(a => ({ lat: a.lat, lon: a.lon, id: a.id, name: a.name, stops: a.stops, loc: a.locality, mun: a.municipality_name })));
    await CMetropolitana.vehicles.fetchAll().then(r => vehicles = { ...CMetropolitana.vehicles.cache._cache });
    Object.keys(vehicles).map(key => {
        newVec = vehicles[key];
        vehicles[key] = { id: newVec.id, tripId: (newVec.timestamp - now > -15000 ? newVec.trip_id : null), stopId: newVec.stop_id, timestamp: newVec.timestamp, lat: newVec.lat, lon: newVec.lon, bearing: newVec.bearing, pattern_id: newVec.pattern_id, color: (CMetropolitana.lines.cache.get(newVec.line_id) || { color: undefined }).color, notes: (notes[newVec.id] || null) };
        vehicles[key].prev_stop = null;
        if(newVec.timestamp - now > -15000) parsePos(newVec)
    })
    return true;
}

fetchAll().then(r => ready = r);

CMetropolitana.vehicles.on("vehicleUpdate", (oldVec, newVec) => {
    if (!newVec) {
        vehicles[oldVec.id] = undefined;
        positionCache[oldVec.id] = undefined;
    }
    if (!newVec.line_id) return;
    if (!ready) return;
    if (vehicles[newVec.id]) {
        prevStop = (newVec.stop_id === vehicles[newVec.id].stop_id ? vehicles[newVec.id].prev_stop || null : vehicles[newVec.id].stop_id)
    }
    now = Math.round(Date.now() / 1000);
    vehicles[newVec.id] = { id: newVec.id, tripId: (newVec.timestamp - now > -15000 ? newVec.trip_id : null), lineId: newVec.line_id, stopId: newVec.stop_id, timestamp: newVec.timestamp, lat: newVec.lat, lon: newVec.lon, bearing: newVec.bearing, pattern_id: newVec.pattern_id, color: (CMetropolitana.lines.cache.get(newVec.line_id.replaceAll("1998", "CP")) || { color: undefined }).color, notes: (notes[newVec.id] || null) }
    if (vehicles[newVec.id].trip_id) vehicles[newVec.id].prev_stop = prevStop;
    if(newVec.timestamp - now > -15000) parsePos(newVec)
})

function parsePos(vec) {
    if (!positionCache[vec.id]) {
        positionCache[vec.id] = { d: now, lastTrip: (vec.trip_id || "NO_SERVICE"), pos: offsetPos(vec.lat, vec.lon), nodes: ["0|0|" + vec.stop_id], lastStop: vec.stop_id, pattern_id: vec.pattern_id }
    } else if (positionCache[vec.id].lastTrip !== (vec.trip_id || "NO_SERVICE")) {
        saveTH(vec.id).then(() => positionCache[vec.id] = { d: now, lastTrip: (vec.trip_id || "NO_SERVICE"), pos: offsetPos(vec.lat, vec.lon), nodes: ["0|0|" + vec.stop_id], lastStop: vec.stop_id, pattern_id: vec.pattern_id } )
    } else {
        let z = calcOffset(positionCache[vec.id], vec.lat, vec.lon, vec.stop_id, vec.current_status, now);
        if(z) positionCache[vec.id].nodes.push(z)
    }
    wss.clients.forEach(c => {
        if (c.vehicleId === vec.id) {
            c.send(JSON.stringify({ op: "21", i: { g: [vec.lat, vec.lon], b: vec.block_id, t: vec.trip_id, p: vec.pattern_id, s: vec.stop_id, o: vec.bearing } }));
        }
        if (!vec.trip_id) return;
        if (c.stopId === null || !departuresCache[c.stopId] || !(departuresCache[c.stopId].includes(vec.trip_id) && CMetropolitana.stops.cache.get(c.stopId).lines.includes(vec.line_id))) return;
        if (c.readyState === WebSocket.OPEN) {
            c.send(JSON.stringify({ op: "11", i: vehicles[vec.id] }));
        }
    })
}

process.on('message', (data) => {
    if (data === "fetchAll") return fetchAll();
    if (data === "shutdown") return process.exit(1) && process.send("success");
    if (data === "refreshNotes") return JSON.parse(fs.readFileSync(__dirname + "/../data/notes.json"));
});

app.use('/sandbox', require("./sandbox")(positionCache, date));

app.get("/ping", (_, s) => s.sendStatus(200));
app.get("/ready", (_, s) => (ready ? s.sendStatus(200) : s.sendStatus(404)));

app.get("/vehicles", (_, s) => {
    return s.json(!ready ? {} : Object.values(vehicles))
})


app.get("/vehicles/l/:line", async (r, s) => {
    return s.json(!ready ? {} : Object.values(vehicles).filter(a => a.tripId && a.tripId.startsWith(r.params.line)))
})

app.get("/vehicles/:stop", async (r, s) => {
    if (!CMetropolitana.stops.cache.get(r.params.stop)) return s.json({})
    if (!departuresCache[r.params.stop]) departuresCache[r.params.stop] = (await CMetropolitana.stops.cache.get(r.params.stop).departures(Date.now())).map(a => a.trip_id);
    return s.json(!ready ? {} : Object.values(vehicles).filter(a => CMetropolitana.stops.cache.get(r.params.stop).patterns.includes(a.pattern_id) || (departuresCache[r.params.stop] ? departuresCache[r.params.stop].includes(a.trip_id) : false)))
})

app.get("/stats", (_, s) => {
    return s.json(!ready ? {} : { vehicles: Object.values(vehicles).filter(a => a.tripId !== null && a.timestamp > now - 15*60).length, lines: CMetropolitana.lines.cache.size() })
})

app.get("/stop/:id", (r, s) => {
    let res = !ready ? {} : CMetropolitana.stops.cache.get(r.params.id);
    if (res.id) {
        res.lineCols = {}; res.lines.map(a => res.lineCols[a] = (CMetropolitana.lines.cache.get(a) || undefined).color)
        res.alert = res.alerts().map(a => ({ title: a.headerText, desc: a.descriptionText, url: a.url, effect: a.effect }));
    }
    return s.json(res)
})

app.get("/lines/:line", (r, s) => {
    let res = !ready ? {} : CMetropolitana.lines.cache.get(r.params.line);
    return s.json(res)
})

app.get("/routes/:route", (r, s) => {
    let res = !ready ? {} : CMetropolitana.routes.cache.get(r.params.route);
    return s.json(res)
})

app.get("/patterns/:pattern", async (r, s) => {
    try {
        let res = !ready ? {} : (await CMetropolitana.patterns.fetch(r.params.pattern) || CMetropolitana.patterns.cache.get(r.params.pattern));
        if (res.id) {
            schedule = res.trips[0].schedule
            res = { id: res.id, color: res.color, long_name: CMetropolitana.routes.cache.get(res.route_id).long_name, headsign: res.headsign, line_id: res.line_id, shape_id: res.shape_id, path: res.path.map(a => ({ id: a.stop.id, name: a.stop.name, stop_sequence: a.stop_sequence, travel_time: parseTime(schedule[a.stop_sequence - (res.path[0].stop_sequence)].travel_time), lines: a.stop.lines.map(a => ({ text: a, color: (CMetropolitana.lines.cache.get(a) || { color: undefined }).color })) })) }
        }
        return s.json(res)
    } catch (err) {
        return s.json({})
    }
})

app.get("/stops", (r, s) => {
    return s.json(!ready ? {} : stopsRemapped)
})

app.get("/schools", (r, s) => {
    return s.json(!ready ? {} : schoolsRemapped)
})

app.get("/getVehicle.js", (r, s) => {
    s.sendFile(__dirname + "/getVehicle.js")
})

app.get("/test", () => {
    saveTH()
})

app.get("/notes/:rg/:bus", (r, s) => {
    let busNotes = notes[r.params.rg + "|" + r.params.bus];
    s.json(busNotes || [])
})

function parseTime(t) {
    t = t.split(":")
    return parseInt(t[0]) * 60 + parseInt(t[1]) + parseInt(t[2]) / 60;
}

function offsetPos(lat, lon) {
    return [(lat-38.7169).toFixed(5), (lon+9.1395).toFixed(5)]
}

function calcOffset(info, lat, lon, stopId, stopState, date) {
    pos = offsetPos(lat, lon)
    pos[0] -= info.pos[0];
    pos[1] -= info.pos[1];
    pos.push(stopId);
    i = "|" + pos[0].toFixed(5) + "|" + pos[1].toFixed(5) + (info.lastStop !== stopId ? ("|" + stopId) : "") + (stopState === "STOPPED_AT" ? "|STOP" : "");
    info.lastStop = stopId;
    if(info.nodes.find(a => a.endsWith(i))) return;
    return (date - info.d) + i;
}

async function saveTH(arg) {
    if(!arg) {
        Object.keys(positionCache).forEach(k => positionCache[k] !== undefined ? saveTH(k) : null)
        return;
    }
    let p = "./tripHistory/" + date.replaceAll("/","") + "/data"
    let p2 = "./tripHistory/" + date.replaceAll("/","") + "/trips"
    let content = "";
    if(!fs.existsSync("./tripHistory/" + date.replaceAll("/",""))) fs.mkdirSync("./tripHistory/" + date.replaceAll("/",""))
    if(fs.existsSync(p)) {
        content = fs.readFileSync(p, { encoding: "utf-8"})
    }
    if(!content.includes("<ID:" + arg + ">")) content = content + "=\n" + "<ID:" + arg + ">\n";
    fs.writeFileSync(p, content.replace("<ID:" + arg + ">", format(positionCache[arg]) + "\n<ID:" + arg + ">"))
    content = "";
    if(fs.existsSync(p2)) {
        content = fs.readFileSync(p2, { encoding: "utf-8"})
    }
    fs.writeFileSync(p2, content + arg + "@" + positionCache[arg].lastTrip + "\n")
    positionCache[arg] = undefined;
    return;
}

function format(d) {
    return d.lastTrip + "@" + d.pos.join("+") + "@" + d.pattern_id + "@" + d.d + "@" + d.nodes.join(":")
}

setTimeout(() => {
    console.log("Started fetch loop!")
    fetchAll()
    saveTH()
    setInterval(() => {
        fetchAll()
        saveTH()
    }, 24 * 60 * 60 * 1000)
}, (new Date(now * 1000)).setHours(4) + 24 * 60 * 60 * 1000 - now * 1000)


app.listen("8081", () => console.log("Server's ready!"))