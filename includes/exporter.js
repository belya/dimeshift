var Imap = require('imap');
var moment = require('moment');
var rfr = require('rfr');
var db = rfr('includes/models');
var config = rfr('includes/config')
var atob = require('atob')

var AMOUNT_LINE_PATTERN = /Сумма:\d+\.\d+ BYN/i
var AMOUNT_PATTERN = /\d+\.\d+/i

module.exports = {
  convertBase64ToString(base64) {
    return decodeURIComponent(atob(base64).split('').map(function(c) {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
    }).join(''));
  },

  getWallet() {
    return db.Wallet.findOne()
    .then(function(wallet) {
      if (wallet)
        return wallet
      else
        throw "No active wallet!"
    })
  },

  parseMessage(message) {
    console.log(message)
    var lines = message.trim().split("\n")

    var amountLine = lines.filter(x => x.search(AMOUNT_LINE_PATTERN) == 0)[0]
    var amount = parseFloat(amountLine.match(AMOUNT_PATTERN))

    var description = lines[lines.length - 2]

    var datetimeLine = lines[lines.length - 1]
    var datetime = moment(datetimeLine, 'DD.MM.YYYY HH:mm:ss').toDate();

    return {
      "amount": amount,
      "description": description,
      "datetime": datetime
    }
  },

  getToday() {
    return moment().format("MMM DD, YYYY")
  },

  createTransactions(messages) {
    var parse = this.parseMessage

    return this.getWallet().then(function(wallet) {
      var transactionsFromMessage = messages
      .map(parse)
      .map(transaction => {
        return {
          "amount": transaction["amount"],
          "description": transaction["description"],
          "datetime": Math.ceil(transaction["datetime"].getTime() / 1000),
        }
      })

      var promises = transactionsFromMessage
      .map(transaction => wallet.insertTransaction(transaction))

      return Promise.all(promises).then(function() {
        console.log("Transactions created!")
      }).catch(function(err) {
        console.log(err.errors.map(x => x.message))
      })
    })
    
  },

  getMessages() {
    var searchArguments = Object.values(arguments)
    var convert = this.convertBase64ToString

    var imap = new Imap(config.imap);
    imap.connect();

    return new Promise(function(resolve, reject) {
      imap.on('ready', function() {
        imap.openBox(config.imap.inbox, true, function() {
          imap.search(searchArguments, function(err, results) {            
            if (results.length == 0) {
              console.log("Found no messages")
              resolve([])
            } else {
              var f = imap.fetch(results, { bodies: '' });
              var bodies = []
              f.on('message', function(msg, seqno) {
                msg.on('body', function(stream, info) {
                  var buffer = ""
                  stream.on('data', function(chunk) {
                    buffer += chunk.toString();
                  });
                  stream.once('end', function() {
                    var lines = buffer.trim().split("\r\n\r\n")
                    var base64 = lines[lines.length - 1]
                    var message = convert(base64)
                    bodies.push(message)
                  })
                });
              });
              f.once('end', function() {
                console.log("Found", bodies.length, "new messages")
                resolve(bodies)
              });
            }
          })
        })
      })
    }).then(function(result) {
      imap.end()
      return result
    })
  },

  synchronize() {
    var date = this.getToday()
    return this.getMessages(["FROM" , 'click@alfa-bank.by'], ["SINCE", date])
    .then((messages) => {
      return this.createTransactions(messages)
    })
  }
}
