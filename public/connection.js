class TikTokIOConnection {
    constructor(backendUrl) {
        this.socket = io(backendUrl);
        this.uniqueId = null;
        this.options = null;
        this.uniqueIdSet = false; // flag để đánh dấu đã gửi uniqueId chưa

        this.socket.on('connect', () => {
            console.info("Socket connected!");
            // Khi kết nối lại, nếu chưa set uniqueId thì set lại
            if (this.uniqueId && !this.uniqueIdSet) {
                this.setUniqueId();
            }
        });

        this.socket.on('disconnect', () => {
            console.warn("Socket disconnected!");
            // Reset flag khi mất kết nối để setUniqueId lại khi kết nối lại
            this.uniqueIdSet = false;
        });
        
        this.socket.on('streamEnd', () => {
            console.warn("LIVE has ended!");
            this.uniqueId = null;
            this.uniqueIdSet = false;
        });

        this.socket.on('tiktokDisconnected', (errMsg) => {
            console.warn(errMsg);
            if (errMsg && errMsg.includes('LIVE has ended')) {
                this.uniqueId = null;
                this.uniqueIdSet = false;
            }
        });
    }
    testing(data){
        console.info("testing", data);
        this.socket.emit('testing', parseInt(data));
    }
    connect(uniqueId, proxy=false, options) {
        this.disconnect(); // Ngắt kết nối trước khi kết nối mới
        this.uniqueId = uniqueId;
        this.options = options || {};
        this.proxy = proxy;
        // Nếu socket đã được kết nối và chưa gửi uniqueId, gọi setUniqueId
        if (this.socket.connected && !this.uniqueIdSet) {
            this.setUniqueId();
        }

        return new Promise((resolve, reject) => {
            this.socket.once('tiktokConnected', resolve);
            this.socket.once('tiktokDisconnected', reject);

            setTimeout(() => {
                reject('Connection Timeout');
            }, 15000);
        });
    }
    disconnect() {
        this.socket.emit('tiktokDisconnected');
        this.uniqueId = null;
        this.uniqueIdSet = false;
    }
    setUniqueId() {
        this.uniqueIdSet = true; // đánh dấu đã gửi uniqueId
        this.socket.emit('setUniqueId', this.uniqueId, this.options, this.proxy);
    }
    initLogFile(talents){
        console.info("initLogFile", talents);
        this.socket.emit('initLogFile', talents);
    }
    updateLogFile(data,talents){
        console.info("updateLogFile", data, talents);
        this.socket.emit('updateLogFile', data, talents);
    }
    uploadLogFile(){
        console.info("uploadLogFile");
        this.socket.emit('uploadLogFile');
    }
    reRender(uniqueId){
        console.info("reRender");
        this.socket.emit('reRender', uniqueId);
    }
    voting(nickname="HELIOS", duration, max=0){
        isVoting = !!duration;
        if(!duration)  $('#idVoting').val('');
        console.info("voting", nickname, duration, max);
        this.socket.emit('voting', nickname, duration*60, max);
        
    }

    updateVote(score){
        console.info("updateVote", score);
        this.socket.emit('updateVote', score);
    }
    setRound(round){
        console.info("setRound", round);
        this.socket.emit('setRound', round);
    }
    on(eventName, eventHandler) {
        this.socket.on(eventName, eventHandler);
    }
}
