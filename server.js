require('dotenv').config();

const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const path = require('path');
const request = require('request'); // For downloading images
const { OBSWebSocket } = require('obs-websocket-js');
const { TikTokConnectionWrapper, getGlobalConnectionCount } = require('./connectionWrapper');
const { clientBlocked } = require('./limiter');
const { log } = require('console');

const app = express();
const httpServer = createServer(app);
let queue = [];
let isProcessing = false;

//use express to parse json
app.use(express.json());

//create obs instance
const obs = new OBSWebSocket();

// Enable cross origin resource sharing
const io = new Server(httpServer, {
    cors: {
        origin: '*'
    }
});

var receiversDetails = [];
var filePath = '';

const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwNZ6sGPf5vw99dq05D4wOkSLGyyBP-fmi5sNMtgM6yS1OQRGB21l5Ay041edkeZysm/exec';

async function uploadToAppsScript() {
    console.log('Uploading file to Apps Script...');
    // Check if the file exists
    if (!fs.existsSync(filePath)){
        console.log('File does not exist:', filePath);
        return;
    }

    const fileContent = fs.readFileSync(filePath, 'utf-8');

    
    if (isProcessing) {
        console.log("Log file is being processed. Waiting...");
        setTimeout(uploadToAppsScript, 30000); // Retry after 5 seconds
        return;
    }

    try {
        const response = await fetch(APPS_SCRIPT_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                fileName: path.basename(filePath),
                fileContent: fileContent
            })
        });

        const data = await response.text();
        console.log(data);
    } catch (error) {
        console.error('Error uploading file:', error);
    }
}

// Run every 5 minutes
setInterval(uploadToAppsScript, 5 * 60 * 1000);


// API route to save member avatars
app.post('/saveMemberAvatars', (req, res) => {
    const imageUrls = req.body.imageUrls;
    const avatarFilePaths = {}; // Use an object to store userId -> filePath mapping

    const avatarsDir = path.join(__dirname, 'memberAvatars');

    // Ensure the directory exists and clear old files
    if (!fs.existsSync(avatarsDir)) {
        fs.mkdirSync(avatarsDir, { recursive: true });
    } else {
        const files = fs.readdirSync(avatarsDir);
        files.forEach(file => {
            fs.unlinkSync(path.join(avatarsDir, file));
            console.log(`Deleted old file: ${file}`);
        });
    }
      
   
    console.log('is it empty?', fs.readdirSync(avatarsDir).length === 0);
    let processedCount = 0; // Track completed downloads

    imageUrls.forEach(({ url, userId }) => {
        const fileName = `${userId}.jpg`;
        const filePath = path.join(avatarsDir, fileName);

        // Download the image and save it
        request(url)
            .pipe(fs.createWriteStream(filePath))
            .on('finish', () => {
                avatarFilePaths[userId] = filePath;
                processedCount++;
                console.log(`Downloaded from ${url} and saved image for userId ${userId} to ${filePath}`);

                // Send the response when all images are processed
                if (processedCount === imageUrls.length) {
                    res.json({ avatarFilePaths });
                }
            })
            .on('error', err => {
                console.error(`Error downloading image for userId ${userId}:`, err);
            });
    });
});
  
  // Serve the images from the 'memberAvatars' folder
  app.use('/memberAvatars', express.static(path.join(__dirname, 'memberAvatars')));
// Connect to OBS WebSocket function
async function connectToOBS() {
    //check if obs is already connected
    if (obs._socket && obs._socket.readyState === 1) {
        console.log('Already connected to OBS');
        return;
    }
    try {
        // Connect to OBS WebSocket
        await obs.connect(
            process.env.OBS_ADDRESS || 'ws://localhost:4455',
            process.env.OBS_PASSWORD || ''
        );
        console.log('Connected to OBS WebSocket');
    } catch (error) {
        console.error('Failed to connect to OBS WebSocket:', error);
    }
}
async function logGift(logEntry) {
    return new Promise((resolve, reject) => {
        queue.push({ logEntry, resolve, reject });
        if(!isProcessing) processQueue();
    });
}
async function processQueue() {
    isProcessing = true;

    while (queue.length > 0) {
        const { logEntry, resolve, reject } = queue.shift();

        try {
            const data = await fs.promises.readFile(filePath, 'utf-8');
            let jsonData = JSON.parse(data);
            //find msgId in jsonData match logEntry.msgId
            const existingEntry = jsonData.find(entry => entry.msgId === logEntry.msgId);
            if (existingEntry) {
                //update receiversDetails
                existingEntry.receiversDetails = logEntry.receiversDetails
                if(existingEntry.msgId === 'manual') {
                    existingEntry.timestamp = logEntry.timestamp;
                }
            }else{
                // Add the new log entry to the JSON data
                jsonData.push(logEntry);
            }
            // Write the updated JSON data back to the file
            await fs.promises.writeFile(filePath, JSON.stringify(jsonData, null, 2), 'utf-8');
            resolve();
        } catch (error) {
            if (err.code !== 'ENOENT') throw err; // Ignore "file not found" errors
            console.error(error);
            reject(error);
        }
    }

    isProcessing = false;
}

io.on('connection', (socket) => {
    let tiktokConnectionWrapper;

    console.info('New connection from origin', socket.handshake.headers['origin'] || socket.handshake.headers['referer']);
    // connectToOBS();
    socket.on('setUniqueId', (uniqueId, options, proxy) => {

        // Prohibit the client from specifying these options (for security reasons)
        if (typeof options === 'object' && options) {
            // delete options.requestOptions;
            // delete options.websocketOptions;
        } else {
            options = {};
        }

        // Session ID in .env file is optional
        if (process.env.SESSIONID) {
            options.sessionId = process.env.SESSIONID;
            console.info('Using SessionId');
        }

        // Check if rate limit exceeded
        if (process.env.ENABLE_RATE_LIMIT && clientBlocked(io, socket)) {
            socket.emit('tiktokDisconnected', 'You have opened too many connections or made too many connection requests. Please reduce the number of connections/requests or host your own server instance. The connections are limited to avoid that the server IP gets blocked by TokTok.');
            return;
        }

        // Connect to the given username (uniqueId)
        try {
            tiktokConnectionWrapper = new TikTokConnectionWrapper(uniqueId, options, true);
            tiktokConnectionWrapper.connect();
        } catch (err) {
            socket.emit('tiktokDisconnected', err.toString());
            return;
        }

        // Redirect wrapper control events once
        tiktokConnectionWrapper.once('connected', state => socket.emit('tiktokConnected', state));
        tiktokConnectionWrapper.once('disconnected', reason => socket.emit('tiktokDisconnected', reason));

        // Notify client when stream ends
        tiktokConnectionWrapper.connection.on('streamEnd', () => socket.emit('streamEnd'));

        // Redirect message events
        tiktokConnectionWrapper.connection.on('rawData', (messageTypeName, binary) => {
            socket.emit('rawData', messageTypeName, binary);
        })
        tiktokConnectionWrapper.connection.on('roomUser', msg => socket.emit('roomUser', msg));
        tiktokConnectionWrapper.connection.on('member', msg => socket.emit('member', msg));
        tiktokConnectionWrapper.connection.on('chat', msg => socket.emit('chat', msg));
        tiktokConnectionWrapper.connection.on('gift', msg => {
            //log the gift to the file
            const logEntry = {
                giftId: msg.giftId,
                repeatCount: msg.repeatCount,
                giftName: msg.giftName,
                diamondCount: msg.diamondCount,
                diamondsTotal: msg.repeatCount * msg.diamondCount,
                giftPictureUrl: msg.giftPictureUrl,
                receiverUserInGroupLive: msg.receiverUserInGroupLive || null,
                userId: msg.userId,
                uniqueId: msg.uniqueId,
                nickname: msg.nickname,
                profilePictureUrl: msg.profilePictureUrl || null,
                gifterLevel: msg.gifterLevel,
                teamMemberLevel: msg.teamMemberLevel,
                msgId: msg.msgId,
                timestamp: msg.timestamp,
                receiversDetails: [] // Array for receiver details
            }
            // Find the receiver in the receiversDetails array
            logEntry.receiversDetails = receiversDetails.map(receiver => {
                if(!msg.receiverUserInGroupLive) {
                    if(receiver.userId === msg.userId) {
                        receiver.receiveDiamond = logEntry.diamondsTotal;
                    }
                }else if(receiver.nickname === msg.receiverUserInGroupLive) {
                    receiver.receiveDiamond = logEntry.diamondsTotal;
                }
                return receiver;
            })
            console.log('JSON entry:', JSON.stringify(logEntry, null, 2));
            // Append the log entry to the existing file
            logGift(logEntry)
            
            socket.emit('gift', msg)
        });
        tiktokConnectionWrapper.connection.on('social', msg => socket.emit('social', msg));
        tiktokConnectionWrapper.connection.on('like', msg => socket.emit('like', msg));
        tiktokConnectionWrapper.connection.on('questionNew', msg => socket.emit('questionNew', msg));
        tiktokConnectionWrapper.connection.on('linkMicBattle', msg => socket.emit('linkMicBattle', msg));
        tiktokConnectionWrapper.connection.on('linkMicArmies', msg => socket.emit('linkMicArmies', msg));
        tiktokConnectionWrapper.connection.on('liveIntro', msg => socket.emit('liveIntro', msg));
        tiktokConnectionWrapper.connection.on('emote', msg => socket.emit('emote', msg));
        tiktokConnectionWrapper.connection.on('envelope', msg => socket.emit('envelope', msg));
        tiktokConnectionWrapper.connection.on('subscribe', msg => socket.emit('subscribe', msg));
        tiktokConnectionWrapper.connection.on('liveMember', msg => socket.emit('liveMember', msg));
        tiktokConnectionWrapper.connection.on('competition', msg => socket.emit('competition', msg));   
    });

    socket.on('updateLogFile', (data, receiversDetails) => {
        
        let logEntry = {
            giftId: data.giftId || 0,
            repeatCount: data.repeatCount || 0,
            giftName: data.giftName || '',
            diamondCount: data.diamondCount || 0,
            diamondsTotal: (data.repeatCount || 0) * (data.diamondCount || 0),
            giftPictureUrl: data.giftPictureUrl || '',
            receiverUserInGroupLive: data.receiverUserInGroupLive || '',
            userId: data.userId || '',
            uniqueId: data.uniqueId || '',
            nickname: data.nickname || '',
            profilePictureUrl: data.profilePictureUrl || '',
            gifterLevel: data.gifterLevel || 0,
            teamMemberLevel: data.teamMemberLevel || 0,
            msgId: data.msgId,
            timestamp: data.timestamp,
            receiversDetails // Array for receiver details
        }
        console.log('JSON entry:', JSON.stringify(logEntry, null, 2));
        logGift(logEntry)
    })
    socket.on('uploadLogFile', () => {
        console.info('uploadLogFile', filePath);
        //upload the file to apps script
        uploadToAppsScript();
    });
    socket.on('initLogFile', (talents) => {
        console.info("initLogFile", talents);
        //check if folder exists or else create it
        //logDir will be logs/tyht/MMYY
        let now = new Date();
        let folderDate = new Date(now - 25200000);
        // const logDir = path.join(__dirname, 'logs', talents[0].uniqueId, `${folderDate.getMonth() + 1}${folderDate.getFullYear()}`);
        const logDir = path.join(__dirname, 'logs', talents[0].uniqueId, `${String(folderDate.getMonth() + 1).padStart(2, '0')}${folderDate.getFullYear()}`);
        if (!fs.existsSync(logDir)) {
            fs.mkdirSync(logDir, { recursive: true });
        }
        console.log('Log directory created:', logDir);
        //filename will be formatted as YYYYMMDD_HHMMSS.json but the is in UTC+0, know that we are at UTC+7
        const filename = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}.json`;
        filePath = path.join(logDir, filename);
        //create first log entry
        receiversDetails = talents.map(talent => {
            delete talent.score;
            talent.receiveDiamond = 0;
            return talent;
        })
        console.log('Log file path:', filePath);
        console.log('receivers',receiversDetails)
        const logEntry = [{
            userId: 'manual',
            nickname: 'manual',
            uniqueId: 'manual',
            msgId: 'manual',
            repeatCount: 0,
            diamondsCount: 0,
            diamondsTotal: 0,
            timestamp: Number(now),
            receiversDetails
        }]
        console.log('JSON entry:', JSON.stringify(logEntry, null, 2));
        //create the file
        fs.writeFileSync(filePath, JSON.stringify(logEntry, null, 2), 'utf-8');
        console.log('Log file created:', filePath);
    });
    socket.on('disconnect', () => {
        uploadToAppsScript();
        console.info('Client disconnected');
        // Disconnect the TikTok connection wrapper if it exists
        if (tiktokConnectionWrapper) {
            tiktokConnectionWrapper.disconnect();
        }
    });
});

// Emit global connection statistics
setInterval(() => {
    io.emit('statistic', { globalConnectionCount: getGlobalConnectionCount() });
}, 5000)

// Serve frontend files
app.use(express.static('public'));

// Start http listener
const port = process.env.PORT || 8081;
httpServer.listen(port);
console.info(`Server running! Please visit http://localhost:${port}`);