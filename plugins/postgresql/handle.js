const _ = require('lodash');
const fs = require('fs');
const pg = require('pg');

const util = require('../../core/util.js');
const config = util.getConfig();
const dirs = util.dirs();

const log = require(util.dirs().core + 'log');
const postgresUtil = require('./util');

const adapter = config.postgresql;

// verify the correct dependencies are installed
const pluginHelper = require(dirs.core + 'pluginUtil');
const pluginMock = {
  slug: 'postgresql adapter',
  dependencies: config.postgresql.dependencies
};

const cannotLoad = pluginHelper.cannotLoad(pluginMock);
if(cannotLoad){
  util.die(cannotLoad);
}

const plugins = require(util.dirs().gekko + 'plugins');

const version = adapter.version;

const dbName = postgresUtil.database();

const mode = util.gekkoMode();

const connectionString = config.postgresql.connectionString;

const checkClient = new pg.Pool({
  connectionString: connectionString+'/postgres',
});
const pool = new pg.Pool({
  connectionString: connectionString+'/'+dbName,
});

/* Postgres does not have 'create database if not exists' so we need to check if the db exists first.
This requires connecting to the default postgres database first. Your postgres user will need appropriate rights. */
//checkClient.connect(function(err){
  //if(err){
    //util.die(err);
  //}
checkClient.connect((err, client, done) => {  
  log.debug("Check database exists: "+dbName);
  const query = client.query("select count(*) from pg_catalog.pg_database where datname = $1",[dbName], 
    (err, res) => {
      if(err) {
        done();
        util.die(err);
      }
      if(res.rows[0].count == 0) { //database does not exist
        log.debug("Database "+dbName+" does not exist");
        if(mode === 'realtime') { //create database if not found
          log.debug("Creating database "+dbName);
          client.query("CREATE DATABASE "+dbName,function(err) {
            done();
            if(err){
              done();
              util.die(err);
            } else {
                log.debug("Postgres connection pool is ready, db "+dbName);
                upsertTables();
            }
          });
        }else if(mode === 'backtest') {
          done();
          util.die(`History does not exist for exchange ${config.watch.exchange}.`);
        }else{
          done();
          util.die(`Start gekko first in realtime mode to create tables. You are currently in the '${mode}' mode.`);
        }
      }else{ //database exists
        done();
        log.debug("Database exists: "+dbName);
        log.debug("Postgres connection pool is ready, db "+dbName);
        upsertTables();
      }  
    });
});


function upsertTables() {
  var upsertQuery = 
    `CREATE TABLE IF NOT EXISTS
    ${postgresUtil.table('candles')} (
      id BIGSERIAL PRIMARY KEY,
      start integer UNIQUE,
      open double precision NOT NULL,
      high double precision NOT NULL,
      low double precision NOT NULL,
      close double precision NOT NULL,
      vwp double precision NOT NULL,
      volume double precision NOT NULL,
      trades INTEGER NOT NULL
    );`;


  pool.connect((err,client,done) => {
    client.query(upsertQuery, (err) => {
      done();
    });
  });
}



module.exports = pool;
