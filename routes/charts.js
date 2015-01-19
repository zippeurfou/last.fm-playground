var express = require('express');
var router = express.Router();
var models = require('../models');
var TagSimilar = models.tagSimilarModel;
var  Artist = models.artistModel;

//This is a work in progress

/* GET home page. */
router.get('/', function(req, res, next) {
  //Let's get all the similarities so we can create two chord charts between similarities
  res.render('charts', { title: 'LastFm playground app charts' });
});

//This is a work in progress
router.get('/:type/:name', function(req, res, next) {
});

module.exports = router;
