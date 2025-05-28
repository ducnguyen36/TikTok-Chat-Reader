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

const app = express();
const httpServer = createServer(app);
let giftQueue = [];
let isProcessing = false;
let round = 0;
let uploadInterval = null;
let groupVoting = false;
let groupName = '';
isAcceptVote = true; // Default to accepting votes

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
    if (!fs.existsSync(filePath)) {
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


app.get('/get-log', (req, res) => {
    if (!fs.existsSync(filename)) {
        return res.json([]); // If no log file exists yet, return an empty array
    }

    fs.readFile(filename, 'utf8', (err, data) => {
        if (err) {
            console.error('Error reading log file:', err);
            return res.status(500).send('Error reading log file');
        }
        res.json(JSON.parse(data)); // Return the parsed log data
    });
});

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

function logGift(logEntry) {
    return new Promise((resolve, reject) => {
        // Check for existing entry in giftQueue
        const existing = giftQueue.find(item => item.logEntry.msgId === logEntry.msgId);

        if (existing) {
            // Update receiversDetails and optionally timestamp
            existing.logEntry.receiversDetails = logEntry.receiversDetails;

            if (existing.logEntry.msgId === 'manual') {
                existing.logEntry.timestamp = logEntry.timestamp;
            }

            resolve(); // Consider it done for now — it'll be written during batch
        } else {
            // New entry, push to queue
            giftQueue.push({ logEntry, resolve, reject });
        }
    });
}

setInterval(() => {
    if (!isProcessing && giftQueue.length > 0) {
        processQueue();
    }
}, 5000);

async function processQueue() {
    isProcessing = true;

    try {
        let jsonData = [];

        // Try reading the file (if it exists)
        try {
            const data = await fs.promises.readFile(filePath, 'utf-8');
            jsonData = JSON.parse(data);
        } catch (err) {
            if (err.code !== 'ENOENT') {
                console.error('Error reading file:', err);
                return;
            }
        }

        // Process entries in the queue
        while (giftQueue.length > 0) {
            const { logEntry, resolve, reject } = giftQueue.shift();

            try {
                const existingEntry = jsonData.find(entry => entry.msgId === logEntry.msgId);
                if (existingEntry) {
                    existingEntry.receiversDetails = logEntry.receiversDetails;
                    if (existingEntry.msgId === 'manual') {
                        existingEntry.timestamp = logEntry.timestamp;
                    }
                } else {
                    jsonData.push(logEntry);
                }

                resolve();
            } catch (err) {
                console.error('Error processing log entry:', err);
                reject(err);
            }
        }

        // Write once after processing all
        await fs.promises.writeFile(filePath, JSON.stringify(jsonData, null, 2), 'utf-8');
    } catch (error) {
        console.error('Error during batch processing:', error);
    }

    isProcessing = false;
}

/**
 * Recursively gets all .json files in a directory and its subdirectories
 */
function getAllJsonFiles(dir, fileList = []) {
  const files = fs.readdirSync(dir);

  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      getAllJsonFiles(fullPath, fileList);
    } else if (path.extname(fullPath) === '.json') {
      fileList.push({ path: fullPath, birthtime: stat.birthtime });
    }
  }

  return fileList;
}

io.on('connection', (socket) => {
    let tiktokConnectionWrapper;

    console.info('New connection from origin', socket.handshake.headers['origin'] || socket.handshake.headers['referer']);
    const origin = socket.handshake.headers['origin'] || socket.handshake.headers['referer'];
    if(origin.length !== 'http://localhost:8082/') socket.emit('roundChanged', round);
    socket.on('setUniqueId', (uniqueId, options, proxy) => {

        // Prohibit the client from specifying these options (for security reasons)
        if (typeof options === 'object' && options) {
            delete options.requestOptions;
            delete options.websocketOptions;
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

            socket.emit('gift', msg)
            // check if the gift repeat end
            //log the gift to the file
            if (msg.repeatEnd || msg.giftType !== 1) {
                const logEntry = {
                    giftId: msg.giftId,
                    repeatCount: msg.repeatCount,
                    giftName: msg.giftName,
                    round: isAcceptVote ? round : 0,
                    group: (round === 'group' && groupVoting) ? groupName : '',
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
                //clone the receiversDetails array deeply so it won't be affected by the next log entry
                const cloneReceiversDetails = JSON.parse(JSON.stringify(receiversDetails));
                // Find the receiver in the receiversDetails array
                logEntry.receiversDetails = cloneReceiversDetails.map(receiver => {
                    if (!msg.receiverUserInGroupLive) {
                        if (receiver.isHost) {
                            receiver.receiveDiamond = logEntry.diamondsTotal;
                        } else {
                            receiver.receiveDiamond = 0;
                        }
                    } else if (receiver.nickname === msg.receiverUserInGroupLive) {
                        receiver.receiveDiamond = logEntry.diamondsTotal;
                    } else receiver.receiveDiamond = 0;
                    return receiver;
                })
                console.log('JSON entry:', JSON.stringify(logEntry, null, 2));
                // Append the log entry to the existing file
                logGift(logEntry)
                socket.broadcast.emit('updateLeaderboard', logEntry)
                if(groupVoting && groupName) {
                    //if group voting is enabled, emit the groupVoting event
                    socket.broadcast.emit('updateLeaderboardGroup', groupName, logEntry);
                }
            }

        });
        tiktokConnectionWrapper.connection.on('social', msg => socket.emit('social', msg));
        tiktokConnectionWrapper.connection.on('like', msg => {
            // console.log('Like Event',msg.totalLikeCount, oldLikeCount);
            // if(oldLikeCount){
            //     let increaseTienKhi = Math.floor((msg.totalLikeCount - oldLikeCount)/50);
            //     if(increaseTienKhi > 0) {
            //         tienkhi += increaseTienKhi;
            //         console.log('tienkhi bam like', tienkhi);
            //         updateOrbUI(tienkhi/1204);
            //         oldLikeCount = msg.totalLikeCount;
            //     }  
            // }else{
            //     //first time get the like count
            //     console.log('First time get the like count', msg.totalLikeCount);
            //     oldLikeCount = msg.totalLikeCount;
            // }
            socket.emit('like', msg)
        });
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
    socket.on('voting', (nickname, duration, max) => {
        console.info('voting', nickname, duration, max);
        if(max === -100){
            groupVoting = true;
            groupName = nickname;
        }else{
            groupVoting = false;
            groupName = '';
        }
        socket.broadcast.emit('voting', nickname, duration, max);
    });
    socket.on('countdown', (duration) => {
        console.info('countdown', duration);
        socket.broadcast.emit('countdown', duration);
    });
    socket.on('toggleAcceptVote', (accept) => {
        console.info('toggleAcceptVote', accept);
        isAcceptVote = accept
        if(!accept) {
            groupVoting = false; // Reset group voting if accept is false
            groupName = '';
        }
    });
    socket.on('hideRanking', (hideMembers) => {
        console.info('hideRanking', hideMembers);
        // Emit the hideRanking event to all clients
        socket.broadcast.emit('hideRanking', hideMembers);
    });
    socket.on('reRender', (uniqueId) => {
        //find the last log file inside the folder with the same uniqueId
        if(uniqueId === '#rankingGrid' && !filePath){
            return;
        }else{
            if(uniqueId !== '#rankingGrid' ){
                const logDir = path.join(__dirname, 'logs', uniqueId);
                if (!fs.existsSync(logDir)) {
                    console.log('Log directory does not exist:', logDir);
                    return;
                }
                //get all json files inside the folder
                const files = getAllJsonFiles(logDir);
                if (files.length === 0) {
                    console.log('No log files found in directory:', logDir);
                    return;
                }
                //sort the files by birthtime
                files.sort((a, b) => b.birthtime - a.birthtime);
                //get the latest file
                filePath = files[0].path;
            }
        }
        console.log('Latest log file:', filePath);
        //read the file and emit reRender event
        fs.readFile(filePath, 'utf8', (err, data) => {
            if (err) {
                console.error('Error reading log file:', err);
                return;
            }
            socket.emit('reRender', JSON.parse(data));
            // console.info('reRender', JSON.parse(data));
        });
    });
    socket.on('uploadLogFile', () => {
        console.info('uploadLogFile', filePath);
        //upload the file to apps script
        uploadToAppsScript();
    });
    socket.on('updateLogFile', (data, receiversDetails, previousTalent) => {
        //clone the receiversDetails array deeply so it won't be affected by the next log entry
        const cloneReceiversDetails = JSON.parse(JSON.stringify(receiversDetails));
        receiversDetails = cloneReceiversDetails.map(receiver => {
            delete receiver.score;
            return receiver;
        })
        let logEntry = {
            giftId: data.giftId || 0,
            repeatCount: data.repeatCount || 0,
            giftName: data.giftName || '',
            round: isAcceptVote? data.round || 0 : 0,
            group: data.group,
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
        socket.broadcast.emit('updateLeaderboard', logEntry, previousTalent);

    })

    socket.on('initLogFile', (talents) => {
        //tien khi
        tienkhi = 0;

        //if filePath exists, and has the same uniqueId, then emit rerender to client
        if (filePath && filePath.includes(talents[0].uniqueId)) {
            console.info('File path already exists, re-rendering...');
            fs.readFile(filePath, 'utf8', (err, data) => {
                if (err) {
                    console.error('Error reading log file:', err);
                    return res.status(500).send('Error reading log file');
                }
                // res.json(JSON.parse(data)); // Return the parsed log data
                socket.emit('reRender', JSON.parse(data));
                // console.info('reRender', JSON.parse(data));
                return;
            });
        }
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
        console.log('receivers', receiversDetails)
        const logEntry = [{
            userId: 'manual',
            nickname: 'manual',
            uniqueId: 'manual',
            msgId: 'manual',
            round: 0,
            repeatCount: 0,
            diamondCount: 0,
            diamondsTotal: 0,
            timestamp: Number(now),
            receiversDetails
        }]
        console.log('JSON entry:', JSON.stringify(logEntry, null, 2));
        //create the file
        fs.writeFileSync(filePath, JSON.stringify(logEntry, null, 2), 'utf-8');
        console.log('Log file created:', filePath);
        // Run every 5 minutes
        uploadInterval = setInterval(uploadToAppsScript, 5 * 60 * 1000);
    });
    socket.on('updateVote', (score) => {
        console.info('updateVote', score);
        //update the score in the receiversDetails array
        socket.broadcast.emit('updateVote', score);
    });
    socket.on('setRound', (newRound) => {
        console.info('setRound', newRound);
        round = newRound;
        // Emit the new round to all clients
        io.emit('roundChanged', round);
    });
    socket.on('disconnect', () => {
        //remove uploadInterval
        if (uploadInterval) {
            clearInterval(uploadInterval);
            uploadInterval = null;
        }
        console.info('Client disconnected, stopping upload interval');
        //final upload to apps script
        uploadToAppsScript();
        console.info('Client disconnected');
        // Disconnect the TikTok connection wrapper if it exists
        if (tiktokConnectionWrapper) {
            tiktokConnectionWrapper.disconnect();
        }
    });
    socket.on('tiktokDisconnected', (errMsg) => {
         //remove uploadInterval
        if (uploadInterval) {
            clearInterval(uploadInterval);
            uploadInterval = null;
        }
        console.info('Client disconnected, stopping upload interval');
        //final upload to apps script
        uploadToAppsScript();
        console.info('Client disconnected');
        // Disconnect the TikTok connection wrapper if it exists
        if (tiktokConnectionWrapper) {
            tiktokConnectionWrapper.disconnect();
        }
    });
    socket.on('testing', (data) => {
        // console.log('testing', data);
        // tienkhi += parseInt(data);
        // if(tienkhi > 1000) tienkhi = 0;
        // console.log('tienkhi testing', tienkhi);
        // updateOrbUI(tienkhi/1204);
    });
});

// Emit global connection statistics
setInterval(() => {
    io.emit('statistic', { globalConnectionCount: getGlobalConnectionCount() });
}, 5000)

// Serve frontend files
app.use(express.static('public'));

// Start http listener
const port = process.env.PORT || 8082;
httpServer.listen(port);
console.info(`Server running! Please visit http://localhost:${port}`);