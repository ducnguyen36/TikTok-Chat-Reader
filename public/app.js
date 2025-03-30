// This will use the demo backend if you open index.html locally via file://, otherwise your server will be used
let backendUrl = location.protocol === 'file:' ? "https://tiktok-chat-reader.zerody.one/" : undefined;
let connection = new TikTokIOConnection(backendUrl);

// Counter
let viewerCount = 0;
let likeCount = 0;
let diamondsCount = 0;

// These settings are defined by obs.html
if (!window.settings) window.settings = {};

$(document).ready(() => {
    $('#connectButton').click(connect);
    $('#uniqueIdInput').on('keyup', function (e) {
        if (e.key === 'Enter') {
            connect();
        }
    });

    if (window.settings.username) connect();
})

function connect() {
    let uniqueId = window.settings.username || $('#uniqueIdInput').val();
    if (uniqueId !== '') {

        $('#stateText').text('Connecting...');

        connection.connect(uniqueId, {
            enableExtendedGiftInfo: true
        }).then(state => {
            $('#stateText').text(`Connected to roomId ${state.roomId}`);

            // reset stats
            viewerCount = 0;
            likeCount = 0;
            diamondsCount = 0;
            updateRoomStats();

        }).catch(errorMessage => {
            $('#stateText').text(errorMessage);

            // schedule next try if obs username set
            if (window.settings.username) {
                setTimeout(() => {
                    connect(window.settings.username);
                }, 30000);
            }
        })

    } else {
        alert('no username entered');
    }
}

// Prevent Cross site scripting (XSS)
function sanitize(text) {
    return text.replace(/</g, '&lt;')
}

function updateRoomStats() {
    $('#roomStats').html(`Viewers: <b>${viewerCount.toLocaleString()}</b> Likes: <b>${likeCount.toLocaleString()}</b> Earned Diamonds: <b>${diamondsCount.toLocaleString()}</b>`)
}

function generateUsernameLink(data) {
    return `<a class="usernamelink" href="https://www.tiktok.com/@${data.uniqueId}" target="_blank">${data.nickname}(${data.uniqueId})</a>`;
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

    container.append(`
        <div class=${summarize ? 'temporary' : 'static'}>
            <img class="miniprofilepicture" src="${data.profilePictureUrl}">
            <span>
                <b>${generateUsernameLink(data)}:</b> 
                <span style="color:${color}">${sanitize(text)}</span>
            </span>
        </div>
    `);

    container.stop();
    container.animate({
        scrollTop: container[0].scrollHeight
    }, 400);
}

/**
 * Add a new gift to the gift container
 */
function addGiftItem(data) {
    console.log(data);
    let container = location.href.includes('obs.html') ? $('.eventcontainer') : $('.giftcontainer');

    if (container.find('div').length > 200) {
        container.find('div').slice(0, 100).remove();
    }

    let streakId = data.userId.toString() + '_' + data.giftId;

    let html = `
        <div data-streakid=${isPendingStreak(data) ? streakId : ''}>
            <img class="miniprofilepicture" src="${data.profilePictureUrl}">
            <span>
                <b>${generateUsernameLink(data)}</b> <span>${data.describe}</span>
                ${data.receiverUserDetails ? `
                    for
                    <img class="miniprofilepicture" src="${data.receiverUserDetails.profilePictureUrl}">
                    <b>${generateUsernameLink(data.receiverUserDetails)}</b>
                ` : ''}
                <br>
                <div>                                                                   
                    <table>                     
                        <tr>
                            <td><img class="gifticon" src="${data.giftPictureUrl}"></td>
                            <td>
                                <span>Name: <b>${data.giftName}</b> (ID:${data.giftId})<span><br>
                                <span>Repeat: <b style="${isPendingStreak(data) ? 'color:red' : ''}">x${data.repeatCount.toLocaleString()}</b><span><br>
                                <span>Cost: <b>${(data.diamondCount * data.repeatCount).toLocaleString()} Diamonds</b><span>
                            </td>
                        </tr>
                    </tabl>
                </div>
            </span>
        </div>
    `;

    let existingStreakItem = container.find(`[data-streakid='${streakId}']`);

    if (existingStreakItem.length) {
        existingStreakItem.replaceWith(html);
    } else {
        container.append(html);
    }

    container.stop();
    container.animate({
        scrollTop: container[0].scrollHeight
    }, 800);
}

var talents =[];
//competition

// connection.on('competition', (msg) => {
//     console.log('Event competition', msg);
  
//     // When status is 5, initialize the competition UI
//     if (msg.status === 3) {
//       // Clear the current PK UI container
//       $("#pkCompetitor").empty();
  
//       // Extract competitor details from the initCompetition object
//       var details = msg.initCompetition.memberInitCompetition.memberInitCompetitionDetails;
  
//       // Check if we have exactly two competitors
//       if (details && details.length === 2) {
//         // Extract competitor data from each detail
//         var competitor1 = details[0].competitor;
//         var competitor2 = details[1].competitor;
  
//         // Build the HTML string for the first competitor
//         var competitor1HTML = `
//           <div class="memberContainer" data-userid="${competitor1.userId}">
//             <div class="memberAvatar">
//               <img src="${competitor1.profilePicture.urls[0]}" alt="${competitor1.userId}">
//             </div>
//             <div class="memberInfo">
//               <div class="memberNickname">${competitor1.nickname}</div>
//               <div class="memberScore">0</div>
//             </div>
//           </div>`;
  
//         // Build the HTML string for the second competitor
//         var competitor2HTML = `
//           <div class="memberContainer" data-userid="${competitor2.userId}">
//             <div class="memberAvatar">
//               <img src="${competitor2.profilePicture.urls[0]}" alt="${competitor2.userId}">
//             </div>
//             <div class="memberInfo">
//               <div class="memberNickname">${competitor2.nickname}</div>
//               <div class="memberScore">0</div>
//             </div>
//           </div>`;
  
//         // Combine the competitor HTML with the PK separator
//         var newHTML = competitor1HTML + '<h1>PK</h1>' + competitor2HTML;
  
//         // Update the pkCompetitor container with the new HTML
//         $("#pkCompetitor").html(newHTML);
//       }
//     }
    
//     // When status is 6, update the competition scores
//     else if (msg.status === 6) {
//       // Get the competition details from the message object
//       var details = msg.memberCompetition.memberCompetitionDetails;
      
//       // Determine the score for each competitor
//       var team1Score = details[0].score || "0";
//       var team2Score = details[1].score || "0";
      
//       // Update the HTML elements for each team
//       $("#pkCompetitor .memberContainer").eq(0).find(".memberScore").text(team1Score);
//       $("#pkCompetitor .memberContainer").eq(1).find(".memberScore").text(team2Score);
//     }
//   });
connection.on('competition', (msg) => {
    console.log('Event competition', msg);
    
    // Helper: initialize PK UI given an array of two competitor objects
  function initPKCompetitor(competitors) {
    if (competitors.length === 2) {
      var competitor1 = competitors[0];
      var competitor2 = competitors[1];

      var competitor1HTML = `
        <div class="memberContainer" data-userid="${competitor1.userId}">
          <div class="memberAvatar">
            <img src="${competitor1.profilePicture.urls[0]}" alt="${competitor1.userId}">
          </div>
          <div class="memberInfo">
            <div class="memberNickname">${competitor1.nickname}</div>
            <div class="memberScore">0</div>
          </div>
        </div>`;

      var competitor2HTML = `
        <div class="memberContainer" data-userid="${competitor2.userId}">
          <div class="memberAvatar">
            <img src="${competitor2.profilePicture.urls[0]}" alt="${competitor2.userId}">
          </div>
          <div class="memberInfo">
            <div class="memberNickname">${competitor2.nickname}</div>
            <div class="memberScore">0</div>
          </div>
        </div>`;

      $("#pkCompetitor").html(competitor1HTML + '<h1>PK</h1>' + competitor2HTML);
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
    var competitors = details.map(function(detail) {
      var talent = talents.find(function(member) {
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
        var competitor1 = details[0].competitor;
        var competitor2 = details[1].competitor;
  
        // Build HTML for the first competitor
        var competitor1HTML = `
          <div class="memberContainer" data-userid="${competitor1.userId}">
            <div class="memberAvatar">
              <img src="${competitor1.profilePicture.urls[0]}" alt="${competitor1.userId}">
            </div>
            <div class="memberInfo">
              <div class="memberNickname">${competitor1.nickname}</div>
              <div class="memberScore">0</div>
            </div>
          </div>`;
  
        // Build HTML for the second competitor
        var competitor2HTML = `
          <div class="memberContainer" data-userid="${competitor2.userId}">
            <div class="memberAvatar">
              <img src="${competitor2.profilePicture.urls[0]}" alt="${competitor2.userId}">
            </div>
            <div class="memberInfo">
              <div class="memberNickname">${competitor2.nickname}</div>
              <div class="memberScore">0</div>
            </div>
          </div>`;
  
        // Combine the competitor HTML with the PK separator
        var newHTML = competitor1HTML + '<h1>PK</h1>' + competitor2HTML;
  
        // Update the pkCompetitor container with the new HTML
        $("#pkCompetitor").html(newHTML);
      }
    } 
    // Stage 2: Live score update (Status 6)
    else if (msg.status === 6) {
      // Get the competition details from the message object
      var details = msg.memberCompetition.memberCompetitionDetails;
      
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
            $("#pkCompetitor h1").text("PK");
        } else if (team2Score > team1Score) {
            $("#pkCompetitor .memberContainer").eq(1).css('background-color', 'yellow');
            $("#pkCompetitor .memberContainer").eq(0).css('background-color', '');
            $("#pkCompetitor h1").text("PK");
        } else { // Draw condition
            $("#pkCompetitor .memberContainer").eq(0).css('background-color', '');
            $("#pkCompetitor .memberContainer").eq(1).css('background-color', '');
            $("#pkCompetitor h1").text("DRAW");
        }
    } 
    // Stage 3: Competition end – update scores and mark winners (Status 5)
    else if (msg.status === 5) {
      var details = msg.endCompetition.memberCompetitionDetails;
      if (details && details.length === 2) {
        details.forEach(function(detail, index) {
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
      }
    }
  });
//live member
connection.on('liveMember', (msg) => {
    // console.log('window href:',window.location.href);
    // if(!window.location.href.includes('index.html')) return;
    // console.log('Event LIVE group member', msg);
    talents = msg.liveMembers.map(function(member) {
        member.score = 0; // Default score; adjust logic as needed
        return member;
      });
    console.log('LIVE group member', talents);
    var $groupMembers = $("#groupmembers");
    $groupMembers.empty(); // Clear any existing content

    // Iterate over each live member and build the HTML structure
    $.each(talents, function(index, member) {
    // Create container div
    var $memberContainer = $('<div class="memberContainer"></div>').attr('data-userid', member.userId);;
    
    // Create the member avatar element (using the first URL)
    var imgUrl = member.profilePicture.urls[0];
    var $memberAvatar = $('<div class="memberAvatar"></div>').append(
      $('<img>').attr("src", imgUrl).attr("alt", member.$nickname)
    );
    
    // Create the member info element
    var $memberInfo = $('<div class="memberInfo"></div>');
    var $nickname = $('<div class="memberNickname"></div>').text(member.nickname);
    // var $userId = $('<div class="memberId"></div>').text(member.userId);
    var $score = $('<div class="memberScore"></div>').text(member.score);
    $memberInfo.append($nickname, $score);
    
    // Append the avatar and info to the container
    $memberContainer.append($memberAvatar, $memberInfo);
    
    // Append the member container to the groupmembers container
    $groupMembers.append($memberContainer);
  });
})

//raw data received
connection.on('rawData', (messageTypeName, binary) => {
    // let data = TikTokIOConnection.parseMessage(messageTypeName, binary);

    // if (data && data.data) {
    //     let msg = data.data;
    //     console.log(msg);
    // }
    // if(messageTypeName !== 'WebcastGiftMessage') return;
    console.log(messageTypeName);
    const hexString = Array.from(new Uint8Array(binary))
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join(' ');

    console.log(hexString);
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
    if (window.settings.showJoins === "0") return;
    console.log(msg);
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
function updateTalentScore(giftData) {
    // Find the talent matching the gift's userId
    let talent = talents.find(t => t.nickname === giftData.receiverUserInGroupLive);
    if (talent) {
      // Update the talent's score
      talent.score += giftData.diamondCount * giftData.repeatCount;
      
      // Update the UI for the talent's score
      $('#groupmembers .memberContainer[data-userid="' + talent.userId + '"] .memberScore')
        .text(talent.score);
    }
  }

// New gift received
connection.on('gift', (data) => {
    if (!isPendingStreak(data) && data.diamondCount > 0) {
        diamondsCount += (data.diamondCount * data.repeatCount);
        updateRoomStats();
        updateTalentScore(data); // Update the talent score
    }

    if (window.settings.showGifts === "0") return;

    addGiftItem(data);
})

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