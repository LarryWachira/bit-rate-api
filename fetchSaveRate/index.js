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


exports.handler = async (event, context, callback) => {

    let response = {
        "statusCode": 200,
        "headers": { "Access-Control-Allow-Origin": "*" }
    };

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


};
