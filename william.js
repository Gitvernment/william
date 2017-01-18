const log = require('winston');
log.level = process.env.LOGLEVEL || 'info';

const Botkit = require('botkit');

const pgp = require('pg-promise')();
const db = pgp(process.env.WILLIAM_POSTGRES_URL);

const logReactionEmojiError = (err) => { if (err) { console.log('Failed to add emoji reaction :(', err); } };
const acknowledgeUserRequest = (slackBot, slackMessage) => slackBot.api.reactions.add({ timestamp: slackMessage.ts, channel: slackMessage.channel, name: 'ok' }, logReactionEmojiError);
const indicateConfusion = (slackBot, slackMessage) => slackBot.api.reactions.add({ timestamp: slackMessage.ts, channel: slackMessage.channel, name: 'thinking_face' }, logReactionEmojiError);

if (!process.env.WILLIAM_SLACK_TOKEN) {
    log.info('Error: Specify token in environment');
    process.exit(1);
}

const controller = Botkit.slackbot({ debug: false });
const slackBot = controller.spawn({ token: process.env.WILLIAM_SLACK_TOKEN });

// Query running
controller.hears([/(what can you)?\w?tell me about (bill)?\w?([a-zA-Z]{2}[\d]{1,4})/], 'direct_message,direct_mention', (bot, slackMessage) => {
    const billId = slackMessage.match[3];

    const query = `select * from bills where identifier = $1 and archived is null limit 1`;
    const args = [billId];

    db.result(query, args)
    .then((data) => {
        acknowledgeUserRequest(slackBot, slackMessage);
        const bill = data.rows[0];
        log.info(`data received: ${JSON.stringify(bill, null, 4)}`);
        const billAttachment = {
            "fallback": bill.summary,
            "color": "#36a64f",
            "pretext": `Okay, here's what I have for ${bill.identifier}:`,
            "author_name": bill.authors.join(', '),
            "title": bill.identifier,
            "title_link": bill.url,
            "text": bill.summary,
            "fields": [
                {
                    "title": "Last Action",
                    "value": bill.last_action,
                    "short": false
                },
                {
                    "title": "Version",
                    "value": bill.version,
                    "short": false
                }
            ]
        }

        if( bill.coauthors ){
            billAttachment[fields].push({
                "title": "Coauthors",
                "value": bill.coauthors.join(', '),
                "short": false
            });
        }

        if( bill.sponsors ){
            billAttachment[fields].push({
                "title": "Sponsors",
                "value": bill.sponsors.join(', '),
                "short": false
            });
        }

        bot.reply(slackMessage, { attachments: [billAttachment] }, (err, resp) => { if( err ){ log.error(err, resp); } });
    })
    .catch((err) => {
        indicateConfusion(slackBot, slackMessage);
        bot.reply(slackMessage, `Something went wrong trying to retrieve that bill information: \`\`\`${JSON.stringify(err, null, 4)}\`\`\``);
    });
});

// Help request
controller.hears(['(help|help me|how do I use you?)'], 'direct_message,direct_mention', (bot, slackMessage) => {
    const supportedQueries = [
        `@william tell me about HB123`,
    ];
    const helpString = `Some supported commands are \`\`\`${supportedQueries.join('\n')}\`\`\``;
    bot.reply(slackMessage, helpString);
});

function startRTM() {
    slackBot.startRTM((err) => {
        if (err) {
            log.info('Failed to start RTM');
            return setTimeout(startRTM, 60000);
        }
        log.info('RTM started!');
        return null;
    });
}
controller.on('rtm_close', startRTM);

startRTM();
