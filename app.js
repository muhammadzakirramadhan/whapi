const { Client } = require('whatsapp-web.js')
const express = require('express')
const socketIO = require('socket.io');
const qrcode = require('qrcode');
const http = require('http');
const fs = require('fs')

const port = process.env.PORT || 8000;
const app = express();
const server = http.createServer(app)
const io = socketIO(server);

app.use(express.json())
app.use(express.urlencoded({
    extended:true
}))

// WhatsApp Api Core 
const sessions = [];
const SESSIONS_FILE = './static/whatsapp-sessions.json';

const createSessionsFileIfNotExists = () =>{
    if (!fs.existsSync(SESSIONS_FILE)) {
        try {
            fs.writeFileSync(SESSIONS_FILE, JSON.stringify([]));
            console.log('Sessions file created successfully.');
        } catch(err) {
            console.log('Failed to create sessions file: ', err);
        }
    }
}
  
createSessionsFileIfNotExists();

const setSessionsFile = (sessions) => {
    fs.writeFile(SESSIONS_FILE, JSON.stringify(sessions), (err) => {
        if(err){
            console.log(err)
        }
    })
}

const getSessionsFile = () => {
    return JSON.parse(fs.readFileSync(SESSIONS_FILE))
}

const createSession = async (id) => {
    console.log('Create sessions : ' + id);
    const SESSION_FILE_PATH = `./static/whatsapp-session-${id}.json`;

    let sessionCfg;
    if (fs.existsSync(SESSION_FILE_PATH)) {
        sessionCfg = require(SESSION_FILE_PATH);
    }

    const client = new Client({
        restartOnAuthFail: true,
        puppeteer: {
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--single-process', // <- this one doesn't works in Windows
            '--disable-gpu'
        ],
        },
        session: sessionCfg
    });

    client.initialize();

    client.on('qr', (qr) => {
        // Generate and scan this code with your phone
        // console.log('QR RECEIVED', qr);
        qrcode.toDataURL(qr, (err, url) => {
            console.log('QR RECEIVED', url);

            io.emit('qr', { 
                id: id, 
                src: url 
            });

            io.emit('message', { 
                id: id, 
                text: 'QR Code received, scan please!' 
            });
        })
    });

    client.on('ready', () => {
        io.emit('ready', {
            id:id
        });

        io.emit('message', {
            id:id,
            text:'WhatsApp Ready!'
        });

        const savedSessions = getSessionsFile();
        const sessionIndex = savedSessions.findIndex(sess => sess.id = id);
        savedSessions[sessionIndex].ready = true;
        setSessionsFile(savedSessions);
    });

    client.on('authenticated', (session) => {
        io.emit('authenticated', {
            id:id
        });

        io.emit('message',  {
            id:id,
            text:'Client is authenticated!'
        });

        console.log('AUTHENTICATED', session);
        sessionCfg=session;
        fs.writeFile(SESSION_FILE_PATH, JSON.stringify(session), function (err) {
            if (err) {
                console.error(err);
            }
        });
    });

    client.on('auth_failure', (session) =>{
        io.emit('message', { 
            id: id, 
            text: 'Auth failure, restarting...' 
        });
    });
    
    client.on('disconnected', (reason) => {
        io.emit('message', { id: id, text: 'Whatsapp is disconnected!' });
        fs.unlinkSync(SESSION_FILE_PATH, function(err) {
            if(err) return console.log(err);
            console.log('Session file deleted!');
        });

        client.destroy();
        client.initialize();
    
        // Menghapus pada file sessions
        const savedSessions = getSessionsFile();
        const sessionIndex = savedSessions.findIndex(sess => sess.id == id);
        savedSessions.splice(sessionIndex, 1);
        setSessionsFile(savedSessions);
    
        io.emit('remove-session', id);
    });

    sessions.push({
        id:id,
        client:client
    });

    const savedSessions = getSessionsFile()
    const sessionsIndex = savedSessions.findIndex(sess => sess.id = id)

    if(sessionsIndex == -1){
        savedSessions.push({
            id:id,
            ready:false
        });

        setSessionsFile(savedSessions);
    }
}

const init = (socket) => {
    const savedSessions = getSessionsFile();

    if(savedSessions.length > 0){
        if(socket){
            socket.emit('init', savedSessions);
        } else {
            savedSessions.forEach(sess => {
                createSession(sess.id)
            });
        }
    }
}

// socket.io

io.on('connection', (socket) => {
    init(socket)
    socket.on('create-session', (data) => {
        console.log(data)
        createSession(data.id);
    })
})

// Application Core
app.get('/', (req, res) => {
    res.status(200).sendFile('index.html', {
        root: __dirname
    });
})


server.listen(port, () => {
    console.log(`Running Server On Port ${port}`);
})