'use strict';


const AWS = require('aws-sdk');
const dDBClient = new AWS.DynamoDB.DocumentClient({ region: 'us-east-1' });
const https = require('https');


function fetchPrice(currency) {

    return new Promise((resolve, reject) => {
        https.get('https://api.bitfinex.com/v1/pubticker/' +
            currency + 'usd', (response) => {
                let data = '';

                response.on('data', (chunk) => {
                    data += chunk;
                });

                response.on('end', () => {
                    resolve(JSON.parse(data));
                });

            }).on("error", (error) => {
                console.error("Error: " + error);
                reject(Error(error));
            });
    });

}


function writePriceToDB(priceInfo) {
    const params = {
        TableName: 'bitRate',
        Item: priceInfo
    };

    return dDBClient.put(params).promise();
}


function readPricesFromDB(limit, currency) {
    const params = {
        TableName: 'bitRate',
        Limit: limit,
        KeyConditionExpression: 'currency = :currency',
        ScanIndexForward: false,
        ExpressionAttributeValues: {
            ':currency': currency
        }
    };

    return dDBClient.query(params).promise();
}


exports.handler = async (event, context, callback) => {

    let response = {
        "statusCode": 200,
        "headers": { "Access-Control-Allow-Origin": "*" }
    };

    const isScheduledEvent = event.source === 'aws.events';
    const supportedCurrencies = ['btc'];

    if (isScheduledEvent) {
        // write btc price to db when invoked by aws scheduled events (every 5 min)
        const data = await fetchPrice('btc');

        const priceInfo = {
            currency: 'btc',
            lastPrice: data.last_price,
            low: data.low,
            high: data.high,
            timestamp: data.timestamp
        };

        await writePriceToDB(priceInfo).then(() => {
            callback(null, {
                ...response,
                statusCode: 201,
                body: { message: 'Prices saved!', item: priceInfo }
            });
        }).catch((err) => {
            console.error(err);
            throw new Error(err);
        });

    }
    else {
        // serve http api requests
        let limit;
        let currency = event.path.split('/')[2];

        if (!supportedCurrencies.includes(currency)) {
            callback(null, {
                ...response,
                body: JSON.stringify({
                    data: [],
                    message: 'Unsupported currency'
                })
            });
        }

        console.log('Event path' + event.path);

        switch (event.path) {
            case `/prices/${currency}/latest`:
            case `/prices/${currency}/latest/`:
                limit = 1;
                break;
            case `/prices/${currency}`:
            case `/prices/${currency}/`:
                limit = 12;
                break;
            default:
                limit = 12;
        }

        await readPricesFromDB(limit, currency).then(data => {
            callback(null, {
                ...response,
                body: JSON.stringify({
                    data: data.Items
                })
            });
        }).catch((err) => {
            console.error(err);
        });

    }
};
