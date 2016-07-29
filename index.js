const superagent = require('superagent-bluebird-promise');
const _ = require('lodash');
const Promise = require('bluebird');
const request = superagent.agent();
const fs = Promise.promisifyAll(require('fs'));

const CARDS = 'cards.json'


// stolen from http://stackoverflow.com/questions/29375100/while-loop-using-bluebird-promises/29396005#29396005
function promiseWhile(predicate, action) {
  function loop(result) {
    if (!predicate(result)) return;
    return Promise.resolve(action(result)).then(loop);
  }
  return Promise.resolve().then(loop);
}


let cards = [];


function getPage(username, page) {
  return request.get(`https://watcha.net/v2/users/${username}/movies.json?filter%5Bsorting%5D=my_rating&page=${page}`)
    .then(res => {
      console.log(res.body.next_page);
      cards = cards.concat(res.body.cards);
      return res;
    });
}


function readStars() {
  return fs.readFileAsync(CARDS, 'utf-8')
    .then(JSON.parse).catch(err=> console.error(err));
}


function gatherStars(username) {
  if (!username) throw new Error('no username');
  const predicate = (res) => !res || !!res.body.next_page;
  const action = (res) => getPage(username, _.get(res, 'body.next_page', 1))
  return promiseWhile(predicate, action)
    .then(() => fs.writeFileAsync(CARDS, JSON.stringify(cards)).then(cards))
}


const argv = require('minimist')(process.argv.slice(2));
const state = {
  forceUpdate: !!argv.update,
  user: process.env.WATCHA_USER || argv.user,
  output: argv.output || 'console'
};


function checkUptodate() {
  if (state.forceUpdate) return Promise.reject(new Error('out of date'));
  return fs.accessAsync(CARDS); 
}


function output(cards) {
  const con = cards => {
    console.log(cards);
    const total = cards.length;
    const grouped = _.groupBy(cards, 'rating');
    const ratings = _(grouped).keys().sortBy().value();
    _.each(ratings, rating => {
      const group = grouped[rating];
      const length = group.length;
      console.log(`${rating}\t${Math.floor(length / total * 1000) / 10}%(${group.length})`);
    });
  }
  const csv = cards => {
    const header = Object.keys(cards[0]);
    const contents = _.map(cards, card => `"${card.title}",${card.rating}`);
    return fs.writeFileAsync('cards.csv', [header].concat(contents).join('\n'));
  };
  const markdown = cards => {
    const header = Object.keys(cards[0]);
    const header2 = header.map(col => _.repeat('-', col.length));
    const contents = _.map(cards, card => _.values(card));
    const lines = [header, header2].concat(contents);
    return fs.writeFileAsync('cards.md', lines.map(line => line.join(' | ')).join('\n'));
  }
  const handlers = { console: con, markdown, csv };
  return (handlers[state.output] || handlers.console)(cards);
}


function main() {
  checkUptodate()
    .catch((err) => gatherStars(state.user))
    .then(() => readStars())
    .then((cards) => {
      const picked = _.map(cards, card => ({title: card.items[0].item.title, rating: card.items[0].item.owner_action.rating}))
      return picked;
    })
    .then(output)
    .catch(err => console.error(err));
}


main();
