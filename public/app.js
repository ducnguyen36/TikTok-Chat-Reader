// This will use the demo backend if you open index.html locally via file://, otherwise your server will be used
let backendUrl = location.protocol === 'file:' ? "https://tiktok-chat-reader.zerody.one/" : undefined;
let connection = new TikTokIOConnection(backendUrl);

// Counter
let viewerCount = 0;
let likeCount = 0;
let diamondsCount = 0;

let scoreTemp = [];
let round = 0;
var talents = [];
let roomState;
let isVoting = false;
let isChasing = false;
let groupVoting = false;
hideRowMembers = [];

//create obs instance
const obs = new OBSWebSocket();


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
      'ws://localhost:4455',
      ''
    );
    console.log('Connected to OBS WebSocket');
  } catch (error) {
    console.error('Failed to connect to OBS WebSocket:', error);
  }
}

// These settings are defined by obs.html
if (!window.settings) window.settings = {};

$(document).ready(() => {
  $('#connectButton').click(() => {
    window.settings.username = ''
    talents = [];
    console.log('talents', talents);
    connect();
  });
  $('#uniqueIdInput').on('keyup', function (e) {
    if (e.key === 'Enter') {
      window.settings.username = ''
      talents = [];
      console.log('talents', talents);
      connect();
    }
  });
  connectToOBS();
  if (window.settings.username) connect();
})

function connect() {
  let uniqueId = window.settings.username || $('#uniqueIdInput').val();
  let proxy = window.settings.proxy || false;
  if (uniqueId !== '') {

    $('#stateText').text('Connecting...');
    talents = [];
    roomState = null;
    connection.connect(uniqueId, proxy, {
      enableExtendedGiftInfo: true
      // processInitialData: false,
      // fetchRoomInfoOnConnect: false
    }).then(state => {
      $('#stateText').text(`Connected to roomId ${state.roomId}`);
      roomState = state;
      console.log('roomState', roomState);
      $('h1').text(`HT - ${roomState.roomInfo.owner.nickname.toUpperCase()}`);
      // Adding the whole group as a member
      if (talents.length && (!talents[0].isHost || talents[0].uniqueId !== uniqueId)) {
        talents.unshift({
          userId: roomState.roomId,
          uniqueId: roomState.roomInfo.owner.display_id,
          nickname: roomState.roomInfo.owner.nickname,
          profilePicture: {
            urls: roomState.roomInfo.cover.url_list
          },
          score: 0,
          receiveDiamond: 0,
          isHost: true
        });
        console.log('Members with Group connect', talents);

        // Clear the group members container
        var $groupMembers = $("#groupmembers");
        $groupMembers.empty(); // Clear any existing content

        // Iterate over each live member and build the HTML structure
        $.each(talents, function (index, member) {
          // Create container div
          var $memberContainer = $('<div class="memberContainer"></div>').attr('data-userid', member.userId);;

          // Create the member avatar element (using the first URL)
          var imgUrl = member.profilePicture.urls[0];
          var $memberAvatar = $('<div class="memberAvatar"></div>').append(
            $('<img>').attr("src", imgUrl).attr("alt", member.nickname)
          );
          $memberAvatar.click((e) => {
            $('#idVoting').val(e.target.alt)
          });
          // Create the member info element
          var $memberInfo = $('<div class="memberInfo"></div>');
          var $nickname = $('<div class="memberNickname"></div>').text(member.nickname);
          var $score = $('<div class="memberScore"></div>').text(member.score + member.receiveDiamond);
          var $input = $('<input type="text" onchange="manualUpdateScore(this)" class="memberInput" placeholder="Enter score" value="0">');
          $memberInfo.append($nickname, $score, $input);

          // Append the avatar and info to the container
          $memberContainer.append($memberAvatar, $memberInfo);

          // Append the member container to the groupmembers container
          $groupMembers.append($memberContainer);
        });
        //emit event to server to init the log file
        connection.initLogFile(talents);


      }


      viewerCount = 0;
      likeCount = 0;
      diamondsCount = 0;
      updateRoomStats();
      $('#pkCompetitor').empty(); // Clear any existing content
    }).catch(errorMessage => {
      $('#stateText').text(errorMessage);
      if (talents.length && (!talents[0].isHost || talents[0].uniqueId !== uniqueId)) {
        // if(!roomState.roomInfo.owner)
        talents.unshift({
          userId: roomState?.roomId || 'group',
          uniqueId: roomState?.roomInfo?.owner?.display_id || 'group',
          nickname: roomState?.roomInfo?.owner?.nickname || 'group',
          profilePicture: {
            urls: roomState?.roomInfo.cover?.url_list || ['https://cdn4.iconfinder.com/data/icons/avatar-1-2/100/Avatar-16-512.png']
          },
          score: 0,
          receiveDiamond: 0,
          isHost: true
        });
        console.log('Members with Group connect', talents);

        // Clear the group members container
        var $groupMembers = $("#groupmembers");
        $groupMembers.empty(); // Clear any existing content

        // Iterate over each live member and build the HTML structure
        $.each(talents, function (index, member) {
          // Create container div
          var $memberContainer = $('<div class="memberContainer"></div>').attr('data-userid', member.userId);;

          // Create the member avatar element (using the first URL)
          var imgUrl = member.profilePicture.urls[0];
          var $memberAvatar = $('<div class="memberAvatar"></div>').append(
            $('<img>').attr("src", imgUrl).attr("alt", member.nickname)
          );
          $memberAvatar.click((e) => {
            $('#idVoting').val(e.target.alt)
          });
          // Create the member info element
          var $memberInfo = $('<div class="memberInfo"></div>');
          var $nickname = $('<div class="memberNickname"></div>').text(member.nickname);
          var $score = $('<div class="memberScore"></div>').text(member.score + member.receiveDiamond);
          var $input = $('<input type="text" onchange="manualUpdateScore(this)" class="memberInput" placeholder="Enter score" value="0">');
          $memberInfo.append($nickname, $score, $input);

          // Append the avatar and info to the container
          $memberContainer.append($memberAvatar, $memberInfo);

          // Append the member container to the groupmembers container
          $groupMembers.append($memberContainer);
        });
        //emit event to server to init the log file
        connection.initLogFile(talents);


      }

      // schedule next try if obs username set
      if (window.settings.username) {
        setTimeout(() => {
          connect(window.settings.username, window.setting.proxy);
        }, 30000);
      }
    })

  } else {
    alert('no username entered');
  }
}

//getkeysbyvalue
function getKeysByValue(object, value) {
  return Object.keys(object).filter(key => object[key] === value);
}

// Prevent Cross site scripting (XSS)
function sanitize(text) {
  return text.replace(/</g, '&lt;')
}

function updateRoomStats() {
  $('#roomStats').html(`👀: <b>${viewerCount.toLocaleString()}</b> 💓: <b>${likeCount.toLocaleString()}</b> 🪙: <b>${diamondsCount.toLocaleString()}</b> 💻: <b>${(talents.reduce((sum, member) => sum + member.score + member.receiveDiamond, 0)).toLocaleString()}</b>`)
}

function generateUsernameLink(data) {
  return `
      <a class="usernamelink" href="https://www.tiktok.com/@${data.uniqueId}" target="_blank">
        <img class="miniprofilepicture" src="${data.profilePictureUrl}">
        ${data.nickname}(${data.uniqueId})
      </a>
    `;
}

function isPendingStreak(data) {
  return data.giftType === 1 && !data.repeatEnd;
}

/**
 * Add a new message to the chat container
 */
function addChatItem(color, data, text, summarize) {
  let container = location.href.includes('obs.html') ? $('.eventcontainer') : $('.chatcontainer');

  if (container.find('div').length > 500) {
    container.find('div').slice(0, 200).remove();
  }

  container.find('.temporary').remove();;

  container.prepend(`
        <div class=${summarize ? 'temporary' : 'static'}>
            <img class="miniprofilepicture" src="${data.profilePictureUrl}">
            <span>
                <b>${generateUsernameLink(data)}:</b> 
                <span style="color:${color}">${sanitize(text)}</span>
            </span>
        </div>
    `);
}

// rerender the gift container


/**
 * Add a new gift to the gift container
 */
function addGiftItem(data) {
  console.log(data);
  let container = location.href.includes('obs.html') ? $('.eventcontainer') : $('.giftcontainer');
  //if is voting, the gift that send to without receiverUserDetails will be update receiverUserDetails based on the nickname in #idVoting

  let streakId = data.userId.toString() + '_' + data.giftId;

  let html = `
        <div data-streakid=${isPendingStreak(data) ? streakId : "'' "}
          style="background-color: ${data.diamondCount >= 199 && data.diamondCount <= 450 ? 'rgba(173, 216, 230, 0.4)' : // Light pastel blue
      data.diamondCount >= 451 && data.diamondCount <= 1400 ? 'rgba(135, 206, 250, 0.4)' : // Sky blue pastel
        data.diamondCount >= 1401 && data.diamondCount <= 3500 ? 'rgba(147, 112, 219, 0.4)' : // Light lavender pastel
          data.diamondCount >= 3501 && data.diamondCount <= 10000 ? 'rgba(186, 85, 211, 0.4)' : // Orchid pastel
            data.diamondCount >= 10001 && data.diamondCount <= 20000 ? 'rgba(218, 112, 214, 0.4)' : // Pale violet pastel
              data.diamondCount > 20000 ? 'rgba(221, 160, 221, 0.4)' : // Medium pastel purple
                'transparent'
    }; padding: 3px; margin-bottom: 1px; border-radius: 5px;"
        >
            <span>
                <b>${generateUsernameLink(data)}</b>
                <span>
                  ${data.describe}
                  <img class="gifticon" src="${data.giftPictureUrl}">
                  <b style="${isPendingStreak(data) ? 'color:red' : ''}">x${data.repeatCount}</b>
                  (<b>${(data.diamondCount * data.repeatCount)} 🪙</b> - ${data.giftId}) to
                  <b>${data.receiverUserDetails ? `
                    ${generateUsernameLink(data.receiverUserDetails)}
                  ` : `
                    <a class="usernamelink" href="https://www.tiktok.com/@${talents[0].uniqueId}" target="_blank">
                      <img class="miniprofilepicture" src="${talents[0].profilePicture.urls[0]}">
                      ${talents[0].nickname}(${talents[0].uniqueId})
                    </a>
                  `}</b>
                </span><br>
                ${isPendingStreak(data) ? '' : `
                  <span>
                      ${[...talents].map(talent => `
                        <button
                          ${((!data.receiverUserDetails && talent.isHost) || (data.receiverUserDetails && talent.userId === data.receiverUserDetails.userId)) ? 'class="active"' : ''}
                          data-info='${encodeURIComponent(JSON.stringify(data)).replace(/'/g, "%27")}'
                          onclick=updateLog(this)
                        >
                          ${talent.nickname}
                        </button>  
                      `).join('')}
                  </span>
                `}
            </span>
        </div>
    `;

  let existingStreakItem = container.find(`[data-streakid='${streakId}']`);

  if (existingStreakItem.length) {
    existingStreakItem.replaceWith(html);
  } else {
    container.prepend(html);
  }
}

// Global variables for the two teams (competitors)
var team1 = null;
var team2 = null;

// Global map to track which OBS sources are active
let obsSourcesActive = {};

// ---------------- OBS MediaInputPlaybackEnded Listener ----------------
obs.on('MediaInputPlaybackEnded', event => {
  const inputName = event.inputName;
  // Process only inputs following the naming format "team{number}_{userId}_skill{1-3}"
  if (/^team[12]_.+_skill\d+$/.test(inputName)) {
    console.log(`Media input playback ended for ${inputName}`);
    // Mark the source as inactive
    obsSourcesActive[inputName] = false;
    // Disable the source if not already done
    setOBSVisibility(inputName, false);
  }
});

// Function to trigger the OBS video for a given source name
async function triggerOBSVideo(sourceName) {
  // If this source is already active, do nothing.
  if (obsSourcesActive[sourceName]) {
    console.log(`Source ${sourceName} is already active.`);
    return;
  }
  obsSourcesActive[sourceName] = true;

  // Enable the source in OBS
  await setOBSVisibility(sourceName, true);
}

connection.on('roundChanged', (newRound) => {
  round = newRound;
  if (location.href.includes('leaderboard.html')) {
    connection.reRender("#rankingGrid");
  }
});


connection.on('competition', (msg) => {
  console.log('Event competition', msg);

  // Helper: initialize PK UI given an array of two competitor objects
  function initPKCompetitor(competitors) {
    if (competitors.length === 2) {
      team1 = competitors[0];
      team2 = competitors[1];

      var competitor1HTML = `
        <div class="memberContainer" data-userid="${team1.userId}">
          <div class="memberAvatar">
            <img src="${team1.profilePicture.urls[0]}" alt="${team1.userId}">
          </div>
          <div class="memberInfo">
            <div class="memberNickname">${team1.nickname}</div>
            <div class="memberScore">0</div>
          </div>
        </div>`;

      var competitor2HTML = `
        <div class="memberContainer" data-userid="${team2.userId}">
          <div class="memberAvatar">
            <img src="${team2.profilePicture.urls[0]}" alt="${team2.userId}">
          </div>
          <div class="memberInfo">
            <div class="memberNickname">${team2.nickname}</div>
            <div class="memberScore">0</div>
          </div>
        </div>`;

      $("#pkCompetitor").html(competitor1HTML + '<h1>PK</h1>' + competitor2HTML);
      updateOBSImages(team1, team2);
    }
  }

  // Fallback: if update or end events come and #pkCompetitor is empty,
  // initialize it using talents and the competitor details from the message.
  if ((msg.status === 6 || msg.status === 5) && $("#pkCompetitor").is(':empty')) {
    // console.log('PK UI is empty, initializing with talents and message details.', msg);
    // Get competitor details from the message (update or end)
    var details = (msg.status === 6) ?
      msg.memberCompetition.memberCompetitionDetails :
      msg.endCompetition.memberCompetitionDetails;

    // For each detail, try to find matching talent from talents.liveMembers.
    // Build an array of two competitor objects.
    var competitors = details.map(function (detail) {
      var talent = talents.find(function (member) {
        return member.userId === detail.userId;
      });
      return talent;
    });
    // If not exactly two found, fallback to the first two talents.
    if (competitors.length !== 2) {
      competitors = talents.liveMembers.slice(0, 2);
    }
    initPKCompetitor(competitors);
  }

  // Stage 1: Initialization – build the competitor UI (Status 3)
  if (msg.status === 3) {
    // Clear the current PK UI container
    $("#pkCompetitor").empty();

    // Extract competitor details from the initCompetition object
    var details = msg.initCompetition.memberInitCompetition.memberInitCompetitionDetails;

    // Check if we have exactly two competitors
    if (details && details.length === 2) {
      team1 = details[0].competitor;
      team2 = details[1].competitor;

      // Build HTML for the first competitor
      var competitor1HTML = `
          <div class="memberContainer" data-userid="${team1.userId}">
            <div class="memberAvatar">
              <img src="${team1.profilePicture.urls[0]}" alt="${team1.userId}">
            </div>
            <div class="memberInfo">
              <div class="memberNickname">${team1.nickname}</div>
              <div class="memberScore">0</div>
            </div>
          </div>`;

      // Build HTML for the second competitor
      var competitor2HTML = `
          <div class="memberContainer" data-userid="${team2.userId}">
            <div class="memberAvatar">
              <img src="${team2.profilePicture.urls[0]}" alt="${team2.userId}">
            </div>
            <div class="memberInfo">
              <div class="memberNickname">${team2.nickname}</div>
              <div class="memberScore">0</div>
            </div>
          </div>`;

      // Combine the competitor HTML with the PK separator
      var newHTML = competitor1HTML + '<h1>PK</h1>' + competitor2HTML;

      // Update the pkCompetitor container with the new HTML
      $("#pkCompetitor").html(newHTML);
      updateOBSImages(team1, team2); // Call the function to update OBS images
    }
  }
  // Stage 2: Live score update (Status 6)
  else if (msg.status === 6) {
    // Get the competition details from the message object
    var details = msg.memberCompetition.memberCompetitionDetails;
    setOBSVisibility('team1', false);
    setOBSVisibility('team2', false);
    // Determine the score for each competitor
    var team1Score = details[0].score || "0";
    var team2Score = details[1].score || "0";

    // Update the score elements for each competitor
    $("#pkCompetitor .memberContainer").eq(0).find(".memberScore").text(team1Score);
    $("#pkCompetitor .memberContainer").eq(1).find(".memberScore").text(team2Score);

    // Compare scores and update background colors accordingly
    if (team1Score > team2Score) {
      $("#pkCompetitor .memberContainer").eq(0).css('background-color', 'yellow');
      $("#pkCompetitor .memberContainer").eq(1).css('background-color', '');
      // $("#pkCompetitor h1").text("PK");
    } else if (team2Score > team1Score) {
      $("#pkCompetitor .memberContainer").eq(1).css('background-color', 'yellow');
      $("#pkCompetitor .memberContainer").eq(0).css('background-color', '');
      // $("#pkCompetitor h1").text("PK");
    } else { // Draw condition
      $("#pkCompetitor .memberContainer").eq(0).css('background-color', '');
      $("#pkCompetitor .memberContainer").eq(1).css('background-color', '');
      // $("#pkCompetitor h1").text("DRAW");
    }
  }
  // Stage 3: Competition end – update scores and mark winners (Status 5)
  else if (msg.status === 5) {
    var details = msg.endCompetition.memberCompetitionDetails;
    if (details && details.length === 2) {
      details.forEach(function (detail, index) {
        // Update the score in the corresponding container
        $("#pkCompetitor .memberContainer").eq(index).find(".memberScore").text(detail.score);
        //   console.log('team',index,detail.winningStatus);
        // Determine background color: winningStatus 1 => yellow (win), 2 => blue (lose)
        var bgColor = (detail.winningStatus === 1) ? 'yellow' : (detail.winningStatus === 2) ? 'blue' : '';
        //   console.log('team bgColor',bgColor);
        $("#pkCompetitor .memberContainer").eq(index).css('background-color', bgColor);
      });

      // If both scores are equal, change the PK separator text to "DRAW"
      var score1 = parseInt(details[0].score, 10);
      var score2 = parseInt(details[1].score, 10);
      if (score1 === score2) {
        $("#pkCompetitor h1").text("DRAW");
      }
      team1 = team2 = null; // Reset teams for next competition
      setOBSVisibility('team1', false);
      setOBSVisibility('team2', false);
      //set video KO true
      setOBSVisibility('KO', true);
      //after 3 seconds set video KO false
      setTimeout(() => {
        setOBSVisibility('KO', false);
      }, 3000);

    }
  }
});
//live member
connection.on('liveMember', (msg) => {
  if (talents.length > 1) return;
  if (talents.length === 1 && !talents[0].isHost) return;
  if (talents[0]?.isHost && talents[0]?.uniqueId === $('#uniqueIdInput').val())
    talents = [];
  // console.log('window href:',window.location.href);
  // if(!window.location.href.includes('index.html')) return;
  console.log('Event LIVE group member', msg);
  talents = msg.liveMembers.map(function (member) {
    member.score = 0; // Default score; adjust logic as needed
    member.receiveDiamond = 0; // Default receiveDiamond; adjust logic as needed
    return member;
  });
  // console.log('group member before avatar', talents);
  // Call the server to save the avatar images and get file paths
  saveAvatarsAndGetPaths(talents);
  // Adding the whole group as a member
  if (roomState) {
    if (!talents[0].isHost) {
      talents.unshift({
        userId: roomState?.roomId || 'group',
        uniqueId: roomState?.roomInfo?.owner?.display_id || 'group',
        nickname: roomState?.roomInfo?.owner?.nickname || 'group',
        profilePicture: {
          urls: roomState?.roomInfo.cover?.url_list || ['https://cdn4.iconfinder.com/data/icons/avatar-1-2/100/Avatar-16-512.png']
        },
        score: 0,
        receiveDiamond: 0,
        isHost: true
      });
    }
    console.log('Members with Group', talents);

    // Clear the group members container
    var $groupMembers = $("#groupmembers");
    $groupMembers.empty(); // Clear any existing content

    // Iterate over each live member and build the HTML structure
    $.each(talents, function (member) {
      // Create container div
      var $memberContainer = $('<div class="memberContainer"></div>').attr('data-userid', member.userId);

      // Create the member avatar element (using the first URL)
      var imgUrl = member.profilePicture.urls[0];
      var $memberAvatar = $('<div class="memberAvatar"></div>').append(
        $('<img>').attr("src", imgUrl).attr("alt", member.nickname)
      );
      $memberAvatar.click((e) => {
        $('#idVoting').val(e.target.alt)
      });
      // Create the member info element
      var $memberInfo = $('<div class="memberInfo"></div>');
      var $nickname = $('<div class="memberNickname"></div>').text(member.nickname);
      // var $userId = $('<div class="memberId"></div>').text(member.userId);
      var $score = $('<div class="memberScore"></div>').text(member.score + member.receiveDiamond);
      var $input = $('<input class="manualScore" type="text" onchange="manualUpdateScore(this)" class="memberInput" placeholder="Enter score">');
      $memberInfo.append($nickname, $score, $input);

      // Append the avatar and info to the container
      $memberContainer.append($memberAvatar, $memberInfo);

      // Append the member container to the groupmembers container
      $groupMembers.append($memberContainer);


      //generate default receiversDetails
      // receiversDetailsManual = talents.map(talent => {
      //   const clonedTalent = structuredClone(talent); // Deep copy
      //   delete clonedTalent.score;
      //   clonedTalent.receiveDiamond = 0;
      //   return clonedTalent;
      // });
    });
    //emit event to server to init the log file
    connection.initLogFile(talents);
  }

  console.log('LIVE group member', talents);


})
//save avatars and get paths
function saveAvatarsAndGetPaths(members) {
  // Prepare the image data to send
  const imageUrls = members.map(member => ({
    url: member.profilePicture.urls[0],
    userId: member.userId
  }));

  fetch('/saveMemberAvatars', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ imageUrls }),
  })
    .then(response => response.json())
    .then(data => {
      // Ensure server returns a userId -> avatarFilePath mapping
      const avatarMap = data.avatarFilePaths;

      // Update each member with the correct avatar path
      members.forEach(member => {
        if (avatarMap[member.userId]) {
          member.avatarFilePath = avatarMap[member.userId];
        }
      });

      console.log('Updated members:', members);
    })
    .catch(error => {
      console.error('Error saving avatars:', error);
    });
}


//raw data received
connection.on('rawData', (messageTypeName, binary) => {
  // let data = TikTokIOConnection.parseMessage(messageTypeName, binary);

  // if (data && data.data) {
  //     let msg = data.data;
  //     console.log(msg);
  // }
  // if(messageTypeName !== 'WebcastGiftMessage') return;
  // console.log(messageTypeName);
  const hexString = Array.from(new Uint8Array(binary))
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join(' ');

  // console.log(hexString);
})

// viewer stats
connection.on('roomUser', (msg) => {
  if (typeof msg.viewerCount === 'number') {
    viewerCount = msg.viewerCount;
    updateRoomStats();
  }
})

// like stats
connection.on('like', (msg) => {
  // console.log('Event like', msg);
  if (typeof msg.totalLikeCount === 'number') {
    likeCount = msg.totalLikeCount;
    updateRoomStats();
  }

  if (window.settings.showLikes === "0") return;

  if (typeof msg.likeCount === 'number') {
    addChatItem('#447dd4', msg, msg.label.replace('{0:user}', '').replace('likes', `${msg.likeCount} likes`))
  }
})

// Member join
let joinMsgDelay = 0;
connection.on('member', (msg) => {
  // console.log('Event member', msg);
  if (window.settings.showJoins === "0") return;
  let addDelay = 250;
  if (joinMsgDelay > 500) addDelay = 100;
  if (joinMsgDelay > 1000) addDelay = 0;

  joinMsgDelay += addDelay;

  setTimeout(() => {
    joinMsgDelay -= addDelay;
    addChatItem('#21b2c2', msg, 'joined', true);
  }, joinMsgDelay);
})

// New chat comment received
connection.on('chat', (msg) => {
  if (window.settings.showChats === "0") return;

  addChatItem('', msg, msg.comment);
})

// Function to update a talent's score and UI
// function updateTalentScore(giftData) {
//   // Find the talent matching the gift's userId
//   let talent = talents.find(t => t.nickname === giftData.receiverUserInGroupLive);
//   if (talent) {
//     // Update the talent's score
//     talent.score += giftData.diamondCount * giftData.repeatCount;

//     // Update the UI for the talent's score
//     $('#groupmembers .memberContainer[data-userid="' + talent.userId + '"] .memberScore')
//       .text(talent.score);
//   }
// }
/**
 * Updates the talent's score based on the gift data.
 * @param {Object} giftData - The received gift data.
 * @param {number} calculatedScore - The adjusted score after handling streaks.
 */
function updateTalentScore(giftData, calculatedScore) {
  let talent = talents.find(t => t.nickname === giftData.receiverUserInGroupLive);

  if (talent && document.querySelector('[name="acceptVote"]').checked) {
    // Update the talent's score with the calculated value
    talent.score += calculatedScore;

    // Update the UI with the new score
    $('#groupmembers .memberContainer[data-userid="' + talent.userId + '"] .memberScore')
      .text(talent.score + talent.receiveDiamond);
  } else {
    //Added the score to talents[0]
    talents[0].score += calculatedScore;
    $('#groupmembers .memberContainer[data-userid="' + talents[0].userId + '"] .memberScore')
      .text(talents[0].score + talents[0].receiveDiamond);
  }
}
// const stickerToTalentUIDMap = {
//   9340: "73819731404701696",//bin
//   5827: "7288171320381654017",//dlee
//   5655: "7187027499443307547",//L
//   5269: "6836794112558613505",//Shin
//   6064: "6891817299696501761",//hissin

// }
const stickerToTalentUIDMap = {
  9340: "6651562457256230913",//kity banh kem
  5827: "7248896565702870021",//aliz kem
  5655: "7382010101902738450",//selene hoa hong
  5269: "6505541132893159426",//xayan not nhac

}

connection.on('gift', (data) => {
  data.round = round;
  console.log('Event gift', data);
  let nickname = $('#idVoting').val();
  if (data.receiverUserInGroupLive) {
    const receiverUser = talents.find(talent => talent.nickname === data.receiverUserInGroupLive);
    if (!talents.uniqueId) {
      receiverUser.uniqueId = data.receiverUserDetails?.uniqueId;
    }
  }
  if (document.querySelector('[name="acceptRTVote"]').checked && talents[0].uniqueId === 'moonsiren.ht') {
    let talentData = structuredClone(talents);
    let receiverUserDetails = talentData.find(talent => talent.userId === stickerToTalentUIDMap[data.giftId]);
    if (receiverUserDetails) {
      receiverUserDetails.profilePictureUrl = receiverUserDetails.profilePicture.urls[0];
      data.receiverUserDetails = receiverUserDetails;
      //also update receiverUserInGroupLive
      data.receiverUserInGroupLive = receiverUserDetails.nickname;
    }
    if (!isPendingStreak(data)) {

      //prepare the data to upload log file
      talentData.forEach(talent => {
        // Remove score
        delete talent.score;
        talent.receiveDiamond = 0; // Reset receiveDiamond for each talent
        // Add receiveDiamond based on receiverUserDetails in giftData
        if (talent.nickname === data.receiverUserInGroupLive) {
          talent.receiveDiamond = data.diamondCount * data.repeatCount;
        }
      });
      // Emit the gift data to the server for logging
      connection.updateLogFile(data, talentData);
    }
  }
  if (isVoting && round !== "group" && !data.receiverUserDetails && document.querySelector('[name="acceptVote"]').checked) {
    //make deep copy of talents
    let talentsCopy = structuredClone(talents);
    let receiverUserDetails = talentsCopy.find(talent => talent.nickname === nickname);
    if (receiverUserDetails) {


      receiverUserDetails.profilePictureUrl = receiverUserDetails.profilePicture.urls[0];
      data.receiverUserDetails = receiverUserDetails;
      //also update receiverUserInGroupLive
      data.receiverUserInGroupLive = nickname;
    }
    if (!isPendingStreak(data)) {
      //prepare the data to upload log file
      let talentData = structuredClone(talents);
      talentData.forEach(talent => {
        // Remove score
        delete talent.score;
        talent.receiveDiamond = 0; // Reset receiveDiamond for each talent
        // Add receiveDiamond based on receiverUserDetails in giftData
        if (talent.nickname === data.receiverUserInGroupLive) {
          talent.receiveDiamond = data.diamondCount * data.repeatCount;
        }
      });
      // Emit the gift data to the server for logging
      connection.updateLogFile(data, talentData);

    }
  }
  if (isChasing && document.querySelector('[name="acceptVote"]').checked) {
    //make deep copy of talents
    let talentsCopy = structuredClone(talents);
    let receiverUserDetails = talentsCopy.find(talent => talent.nickname === nickname);
    if (receiverUserDetails) {


      receiverUserDetails.profilePictureUrl = receiverUserDetails.profilePicture.urls[0];
      data.receiverUserDetails = receiverUserDetails;
      //also update receiverUserInGroupLive
      data.receiverUserInGroupLive = nickname;
    }
    if (!isPendingStreak(data)) {
      //prepare the data to upload log file
      let talentData = structuredClone(talents);
      talentData.forEach(talent => {
        // Remove score
        delete talent.score;
        talent.receiveDiamond = 0; // Reset receiveDiamond for each talent
        // Add receiveDiamond based on receiverUserDetails in giftData
        if (talent.nickname === data.receiverUserInGroupLive) {
          talent.receiveDiamond = data.diamondCount * data.repeatCount;
        }
      });
      // Emit the gift data to the server for logging
      connection.updateLogFile(data, talentData);

    }
  }

  if (data.diamondCount > 0) {
    // Track ongoing streaks and calculate the correct score
    let score = data.diamondCount * data.repeatCount;

    if (data.groupId !== 0 && data.giftType === 1) {
      const groupId = data.groupId;

      // Find existing entry and subtract previous cost
      const existingEntry = scoreTemp.find(i => i.groupId === groupId);
      if (existingEntry) {
        score -= existingEntry.cost;
        scoreTemp = scoreTemp.filter(i => i.groupId !== groupId);
      }
      // If the streak is ongoing, store it
      if (!data.repeatEnd) {
        scoreTemp.push({ groupId, cost: data.diamondCount * data.repeatCount });
        //update voting when streak is ongoing
      }

    }
    if (isVoting && nickname === data.receiverUserInGroupLive && document.querySelector('[name="acceptVote"]').checked) {
      connection.updateVote(score);
    }
    if (isVoting && groupVoting && document.querySelector('[name="acceptVote"]').checked) connection.updateVote(score);
    if (isChasing && nickname === data.receiverUserInGroupLive && document.querySelector('[name="acceptVote"]').checked) {
      connection.updateVote(score);
    }
    if (document.querySelector('[name="acceptRTVote"]').checked || data.giftId === 7934) connection.addScoreToStreak(data.giftId, score);
    // else {
    //   if (isVoting && nickname === data.receiverUserInGroupLive && document.querySelector('[name="acceptVote"]').checked) {
    //     connection.updateVote(score);
    //   }
    //   if(isChasing && nickname === data.receiverUserInGroupLive && document.querySelector('[name="acceptVote"]').checked) {
    //     connection.updateVote(score);
    //   }
    //   if (isVoting && groupVoting && document.querySelector('[name="acceptVote"]').checked) connection.updateVote(score);
    // }

    // Update room stats and talent scores
    diamondsCount += score;
    updateRoomStats();
    updateTalentScore(data, score);

    // if (data.diamondCount < 10) {
    // updateOBSImages();
    // }
  }

  if (window.settings.showGifts === "0") return;
  if (!talents[0].isHost) return;
  addGiftItem(data);

  // --- Trigger OBS video for the correct team in gift event ---
  if (team1 && team2 && data.receiverUserDetails) {
    let targetTeam = null;
    if (String(data.receiverUserDetails.userId) === String(team1.userId)) {
      targetTeam = { teamNumber: 1, userId: team1.userId };
    } else if (String(data.receiverUserDetails.userId) === String(team2.userId)) {
      targetTeam = { teamNumber: 2, userId: team2.userId };
    }

    if (targetTeam) {
      // Determine the skill level based on diamondCount
      let skill = "";
      if (data.diamondCount >= 1 && data.diamondCount <= 9) {
        skill = "skill1";
      } else if (data.diamondCount >= 10 && data.diamondCount <= 98) {
        skill = "skill2";
      } else if (data.diamondCount >= 99 && data.diamondCount <= 498) {
        skill = "skill3";
      } else if (data.diamondCount >= 499 && data.diamondCount <= 1499) {
        skill = "skill4";
      } else if (data.diamondCount >= 1500) {
        skill = "skill5";
      }

      // Construct the OBS source name accordingly.
      const sourceName = `team${targetTeam.teamNumber}_${targetTeam.userId}_${skill}`;

      // Trigger OBS video source; now we rely on MediaInputPlaybackEnded
      triggerOBSVideo(sourceName);
    }
  }
});

function updateOBSImages(competitor1, competitor2) {
  //debug with consolelog

  console.log('team1 userId:', JSON.stringify(competitor1.userId));
  console.log('talents userIds:', talents.map(t => JSON.stringify(t.userId)));
  console.log('team2 userId:', JSON.stringify(competitor2.userId));
  console.log('talents userIds:', talents.map(t => JSON.stringify(t.userId)));
  //find the matching talent in the talents array with the same userId with team1 and team 2 then get the avatarFilePath
  const team1Talent = talents.find(t => String(t.userId) === String(competitor1.userId));
  const team2Talent = talents.find(t => String(t.userId) === String(competitor2.userId));
  console.log('team1Talent', team1Talent);
  console.log('team2Talent', team2Talent);
  if (!team1Talent || !team2Talent) {
    console.error('Talent not found for one or both competitors');
    return;
  }

  // Use the avatarFilePath property from the talent object

  // Create a map from talents array for fast lookup by userId
  // const talentsMap = talents.reduce((acc, talent) => {
  //   acc[talent.userId] = talent.avatarFilePath; // Using the avatarFilePath property here
  //   return acc;
  // }, {});

  // Retrieve the avatar file paths based on userId
  const team1AvatarPath = team1Talent.avatarFilePath;
  const team2AvatarPath = team2Talent.avatarFilePath;

  // Check if avatar file paths are valid
  if (!team1AvatarPath || !team2AvatarPath) {
    console.error('Avatar file paths not found for one or both competitors');
    return;
  }

  // Update OBS image sources with file paths and make them visible
  updateOBSImageSource('team1', team1AvatarPath);
  updateOBSImageSource('team2', team2AvatarPath);

  // Make both images visible
  setOBSVisibility('team1', true);
  setOBSVisibility('team2', true);
  setOBSVisibility('fight', true);

  //after 1.5 seconds hide the images
  setTimeout(() => {
    setOBSVisibility('team1', false);
    setOBSVisibility('team2', false);
  }, 1500);
  //after 4 seconds hide the fight image
  setTimeout(() => {
    setOBSVisibility('fight', false);
  }, 4000);
}

/**
* Call a WebSocket request to OBS to update an image source.
* @param {string} sourceName - The name of the OBS source to update.
* @param {string} imageUrl - The new image URL.
*/
async function updateOBSImageSource(sourceName, imageUrl) {
  await obs.call('SetInputSettings', {
    inputName: sourceName,
    inputSettings: { file: imageUrl }
  }).catch(err => console.error(`Failed to update ${sourceName}:`, err));
}
const sceneName = 'Scene'
/**
* Makes an OBS source visible or hidden.
* @param {string} sourceName - The name of the OBS source.
* @param {boolean} visible - Whether to show or hide the source.
*/

async function setOBSVisibility(sourceName, visible) {
  const { sceneItems } = await obs.call('GetSceneItemList', { sceneName });
  const sceneItem = sceneItems.find(item => item.sourceName === sourceName);

  if (sceneItem) {
    await obs.call('SetSceneItemEnabled', {
      sceneName,
      sceneItemId: sceneItem.sceneItemId,
      sceneItemEnabled: visible
    });
    console.log(`${visible ? 'Activated' : 'Deactivated'} source: ${sourceName}`);
  } else {
    console.warn(`Source "${sourceName}" not found in scene "${sceneName}"`);
  }
}

// share, follow
connection.on('social', (data) => {
  if (window.settings.showFollows === "0") return;

  let color = data.displayType.includes('follow') ? '#ff005e' : '#2fb816';
  addChatItem(color, data, data.label.replace('{0:user}', ''));
})

connection.on('streamEnd', () => {
  $('#stateText').text('Stream ended.');

  // schedule next try if obs username set
  if (window.settings.username) {
    setTimeout(() => {
      connect(window.settings.username);
    }, 30000);
  }
})