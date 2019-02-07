'use strict';

const https = require('https');
const url = require('url');
const $ = require('cheerio');

/**
 * This skill finds definitions for commonly used words and phrases, by
 * scraping urbandictionary.com, the online dictionary for slang words and
 * phrases. 
 *
 * The content of urbandictionary.com is copyrighted 1999 - 2019 Urban
 * Dictionary. This skill is not affiliated in way with Urban Dictionary.
 */


// --------------- Helpers that build all of the responses -----------------------

function buildSpeechletResponse(output, repromptText, cardTitle, cardText, shouldEndSession) {
    return {
        outputSpeech: {
            type: 'PlainText',
            text: output,
        },
        card: {
            type: 'Simple',
            title: `${cardTitle}`,
            content: `${cardText}`,
        },
        reprompt: {
            outputSpeech: {
                type: 'PlainText',
                text: repromptText,
            },
        },
        shouldEndSession,
    };
}

function buildResponse(sessionAttributes, speechletResponse) {
    return {
        version: '1.0',
        sessionAttributes,
        response: speechletResponse,
    };
}


// --------------- Functions that control the skill's behavior -----------------------

function getWelcomeResponse(callback) {
    const sessionAttributes = {};
    const cardTitle = 'Urban Dictionary';
    const cardText = 'Ask for a definition';
    const speechOutput = 'Thanks for trying out Urban Dictionary, the online ' +
        'dictionary for slang words and phrases. Ask me for a definition.';
    const repromptText = 'Ask me for a definition.';
    const shouldEndSession = false;

    callback(sessionAttributes,
        buildSpeechletResponse(speechOutput, repromptText, cardTitle, cardText, shouldEndSession));
}

function handleSessionEndRequest(callback) {
    const cardTitle = 'Urban Dictionary';
    const cardText = '';
    const speechOutput = '';
    // Setting this to true ends the session and exits the skill.
    const shouldEndSession = true;

    callback({}, buildSpeechletResponse(speechOutput, null, cardTitle, cardText, shouldEndSession));
}

function getDefinitionForQuery(intent, session, callback) {
    let sessionAttributes = {};
    
    var query = intent.slots.phrase.value;
    if (query) {
        httpGet(query, callback, sessionAttributes);
    } else {
        callback(sessionAttributes, 
            buildSpeechletResponse(
                "I didn't catch that. Try asking me for another definition.",
                "Try asking me for another definition.",
                intent.name,
                "I didn't catch that. Try asking me for another definition.",
                false));
    }   
}

function httpGet(query, callback, attributes, redirect) {
    let options;
    if (redirect) {
        options = url.parse(redirect, true);
    } else {
        options = url.parse('https://www.urbandictionary.com/define.php?term=' + query.replace(' ', '+'));
    }
    console.log(options);

    var request = https.request(options, (res) => {
        res.setEncoding('utf8');
        console.log('STATUS: ' + res.statusCode);
        console.log('HEADERS: ' + JSON.stringify(res.headers));
        if (res.statusCode === 302) {
            httpGet(query, callback, attributes, res.headers.location);
        } else {
            var body = '';
            res.on('data', (chunk) => {
                body += chunk;
            });
            res.on('end', () => {
                let definition = parseDefinition(body);
                callback(attributes, 
                    buildSpeechletResponse(
                        "Here's what I found for " + query  +": " + definition,
                        null,
                        query,
                        definition), true);
            });
        }
    });
    request.on('error', (err) => {
        console.log(err.message);
    });
    request.end();
}

function parseDefinition(DOM) {
    const arr = $('div #content .def-panel .meaning', DOM).toArray();
    for (var i in arr) {
        var definition = $(arr[i]).text();
        // Remove any text inside parentheses
        definition = definition.replace(/ *\([^)]*\) */g, "");
        // Replace periods with newlines
        definition = definition.replace(/[.]/g, '\n')
        // Separate into paragraphs
        definition = definition.split('\n')
        // Take at most the first three paragraphs
        definition = definition.slice(0, 3)
        definition = definition.join('. ');
        return definition;
    }
}

// --------------- Events -----------------------

/**
 * Called when the session starts.
 */
function onSessionStarted(sessionStartedRequest, session) {
    console.log(`onSessionStarted requestId=${sessionStartedRequest.requestId}, sessionId=${session.sessionId}`);
}

/**
 * Called when the user launches the skill without specifying what they want.
 */
function onLaunch(launchRequest, session, callback) {
    console.log(`onLaunch requestId=${launchRequest.requestId}, sessionId=${session.sessionId}`);

    // Dispatch to your skill's launch.
    getWelcomeResponse(callback);
}

/**
 * Called when the user specifies an intent for this skill.
 */
function onIntent(intentRequest, session, callback) {
    console.log(`onIntent requestId=${intentRequest.requestId}, sessionId=${session.sessionId}`);

    const intent = intentRequest.intent;
    const intentName = intentRequest.intent.name;

    // Dispatch to your skill's intent handlers
    if (intentName === 'DefineIntent') {
        getDefinitionForQuery(intent, session, callback);
    } else if (intentName === 'AMAZON.HelpIntent') {
        getWelcomeResponse(callback);
    } else if (intentName === 'AMAZON.StopIntent' || intentName === 'AMAZON.CancelIntent') {
        handleSessionEndRequest(callback);
    } else {
        throw new Error('Invalid intent');
    }
}

/**
 * Called when the user ends the session.
 * Is not called when the skill returns shouldEndSession=true.
 */
function onSessionEnded(sessionEndedRequest, session) {
    console.log(`onSessionEnded requestId=${sessionEndedRequest.requestId}, sessionId=${session.sessionId}`);
    // Add cleanup logic here
}


// --------------- Main handler -----------------------

// Route the incoming request based on type (LaunchRequest, IntentRequest,
// etc.) The JSON body of the request is provided in the event parameter.
exports.handler = (event, context, callback) => {
    try {
        console.log(`event.session.application.applicationId=${event.session.application.applicationId}`);

        /**
         * Prevents someone else from configuring a skill that sends requests to this function.
         */
        if (event.session.application.applicationId !== 'amzn1.ask.skill.cfb7ebc9-4dd9-4366-b807-061bafd7f31f') {
             callback('Invalid Application ID');
        }

        if (event.session.new) {
            onSessionStarted({ requestId: event.request.requestId }, event.session);
        }

        if (event.request.type === 'LaunchRequest') {
            onLaunch(event.request,
                event.session,
                (sessionAttributes, speechletResponse) => {
                    callback(null, buildResponse(sessionAttributes, speechletResponse));
                });
        } else if (event.request.type === 'IntentRequest') {
            onIntent(event.request,
                event.session,
                (sessionAttributes, speechletResponse) => {
                    callback(null, buildResponse(sessionAttributes, speechletResponse));
                });
        } else if (event.request.type === 'SessionEndedRequest') {
            onSessionEnded(event.request, event.session);
            callback();
        }
    } catch (err) {
        callback(err);
    }
};

