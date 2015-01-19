//This is the batch job that populate the data for the analysis
//Ultimately, we should do a cron to execute it periodically




//===========================
//Global var
//========================
var nconf = require('nconf'),
    async = require("async"),
    LastFmNode = require('lastfm').LastFmNode,
    tm = require('text-miner'),
    ttest = require('ttest'),
    jaccard = require('jaccard');

// Setup nconf to use (in-order):
//   1. Command-line arguments
//   2. Environment variables
//   3. A file located at 'path/to/config.json'
// This allow to have a backup if the file is corrupted
nconf.argv()
    .env()
    .file({
        file: 'config.json'
    });
nconf.defaults({
    lastfm: {
        key: "private",
        secret: "private",
        querySize: 1000
    },
    //This is not used (yet)
    similarity: {
        threshold: {
            tag: 0.05,
            artist: 0.05
        }
    }
});

nconf.use("memory");

//Retrieve it
var conf = {
        lastfm: {
            key: nconf.get("lastfm:key"),
            secret: nconf.get("lastfm:key"),
            querySize: nconf.get("lastfm:querySize")
        },
        similarity: {
            threshold: {
                tag: nconf.get("similarity:threshold:tag"),
                artist: nconf.get("similarity:threshold:artist")
            }

        }
    },
    //Create the instance with my token and key.
    lastfm = new LastFmNode({
        api_key: conf.lastfm.key,
        secret: conf.lastfm.secret
    }),
    //mongoose setup.
    mongoose = require('mongoose'),
    models = require('./models'),
    Artist = models.artistModel,
    TagNode = models.tagNodeModel,
    TagSimilar = models.tagSimilarModel;
//========================
//End Global var
//========================






//==================
//Main Loop logic
//==================


/**
 *This is the main function of the app that does the batch job
 *
 **/
exports.run = function() {
    async.waterfall([
        //Connect to the database
        function(callback) {

            setupDb(callback);

        },
        //Retreive the top Artist from Api
        function(callback) {
            getTopArtistsFromApi(callback);
        },
        //In case the top Artists did change we still want to get all the artists that is why we got to query the database for it.
        function(topArtists, callback) {
            getAllArtists(topArtists, callback);
        },
        //We add the Tags to each artists
        function(allArtists, callback) {
            aggregateTagsNodeToArtists(allArtists, callback);
        },
        //We compute similarity between tags, artists and the API and store everything
        function(allArtists, allTagsUnique, callback) {
            var tagsimilarities = computeSimilarityTags(allArtists, allTagsUnique);
            var artistsSimilarities = computeSimilarityArtists(allArtists, tagsimilarities);
            computeComparaisonAPI(artistsSimilarities, tagsimilarities, callback);

        },
        //dbObject is an object with keys artists and tagsSimilars
        function(dbObject, callback) {
            storeData(dbObject, callback);

        }
    ], function(err, result) {

        if (err) throw err;
        console.info("ended task successfully");
        mongoose.connection.close();
    });
}


//===============
//End Global logic loop
//==================





//===================
//first async call setupDb(callback);
//==================

function setupDb(callback) {
    mongoose.connect('mongodb://localhost/test');
    var db = mongoose.connection;
    db.on('error', function(err) {
        console.error(err);
        return callback(err)
    });
    db.once('open', function() {
        console.info("Connected to db");
        //Uncomment to delete everything in database
        mongoose.connection.db.dropDatabase();
        callback(null);
    });
}

//===========
//end of first async task
//============






//==========
//second async task getTopArtistsFromApi(callback);
//===========



function getTopArtistsFromApi(callback) {


    lastfm.request("chart.getTopArtists", {
        page: "1",
        limit: conf.lastfm.querySize,
        handlers: {
            success: function(data) {
                if (checkNotNull(data["artists"]) && checkNotNull(data["artists"]["artist"])) {
                    console.info("Success in retreiving the top artist");
                    var artists = formatArtists(data["artists"]["artist"]);
                    callback(null, artists)
                }
                else {
                    console.err("The data retreiving from chart.getTopArtists is in an unexpected format ", data)
                    callback();

                }
            },
            error: function(error) {
                console.error("Error chart.getTopArtists: ", error.message);
                callback();
            }
        }
    });
    //I am formating it to only keep what I want
    //One could argue that with that few data you should keep everything in case you might need it afterwards
    //since the whole thing of noSQL is unstructured data which make this function useless
    //However, I believe, it is easier to read if you don't know the response format of the query.
    //Plus, the query response format might change and this could is more easy to maintain to it in this case
    function formatArtists(artistsJson) {
        var artists = [];
        // Read the Readme.md to understand why I choose to not collect the others data here
        artists = artistsJson.map(function(elem) {
            return {
                name: elem.name
            }
        })
        return artists;
    };

}



//==========
//END second async task getTopArtistsFromApi(callback);
//===========



//================
//Third async task getAllArtists(topArtists, callback);
//===============


//We get the artist that we didn't find with the first call and
//add them to the local variable so we can update them after.
function getAllArtists(topArtists, callback) {

    //no need to check for duplicate, by definition it is supposed to be unique.
    var artistsNames = getNames(topArtists);
    var allArtists = [];

    //We will now get the artists that are in the database but not in the API call
    //Then query the API to get their updated informations which is playcount and listeners
    //Sadly, the informations we have in chart.getTopArtst are not accurrate.. :-(
    //Therefore, we will also get it for the top Artist we retreived from the API (read README.md to understand why)
    async.waterfall([
            //get missing artists from db
            function(cb) {
                var query = Artist.find({}).where("name").nin(artistsNames).select("name");
                query.exec(function(err, dbArtistsMissingNames) {
                    if (err) return cb(err);
                    console.info("artist that weren't found by topArtists query ", dbArtistsMissingNames.length);
                    dbArtistsMissingNames = dbArtistsMissingNames.map(function(elem) {
                        return elem.name
                    });
                    artistsNames = artistsNames.concat(dbArtistsMissingNames);
                    cb(null, artistsNames);
                })
            },
            //Get the updated informations for each Artists
            function(names, cb) {
                getAllArtistsInfo(names, cb)
            }
        ],
        function(err, result) {
            if (err) return callback(err);
            console.info("Successfully got all Artists updated profiles");
            console.info("We have a total of ", allArtists.length, " artists.");
            callback(null, allArtists);
        });

    function getAllArtistsInfo(names, cb) {
        async.each(names, function(name, cbEach) {
            lastfm.request("artist.getInfo", {
                artist: name,
                handlers: {
                    success: function(data) {
                        if (checkNotNull(data.artist) && checkNotNull(data.artist.stats)) {
                            allArtists.push({
                                name: data.artist.name,
                                playcount: data.artist.stats.playcount,
                                listeners: data.artist.stats.listeners,
                                mbid: data.artist.mbid
                            });
                        }
                        else {
                            console.error("Error with the query artist.getInfo ", JSON.stringify(data));
                        }
                        cbEach();
                    },
                    error: function(error) {
                        console.error("Error artist.getInfo " + error.message);
                        // return cbEach("Error while retreiving an info for an artist " + error.message)
                        cbEach();
                    }
                }
            })

        }, function(err) {
            if (err) return cb(err);
            cb(null, allArtists)
        });
    }
}



//================
//End third async task getAllArtists(topArtists, callback);
//===============




//================
//4 async task aggregateTagsNodeToArtists(allArtists, callback)
//===============




//Retreive the tags node for each artist
//Clean them and add them to allArtists
//TODO optimize the clean method
function aggregateTagsNodeToArtists(allArtists, callback) {
    var artistsNames = getNames(allArtists);
    var allTagsNode = [];
    async.each(artistsNames, function(name, cbEach) {
        lastfm.request("artist.gettoptags", {
            artist: name,
            handlers: {
                success: function(data) {
                    var artistName, tags, tagsFormated, index;
                    //we check that we have data in the correct format
                    if (checkNotNull(data['toptags']) && checkNotNull(data['toptags']['@attr']) && checkNotNull(data['toptags']['tag'])) {
                        artistName = data['toptags']['@attr'].artist;
                        tags = data['toptags']['tag'];
                        //Clean tag to avoid having duplicate or tag with count of 0
                        tags = cleanTags(tags);
                        //Now we get the artist data from the name and aggregate its tags.
                        index = indexFindByKey(allArtists, "name", artistName);
                        if (index !== null) {
                            tagsFormated = [];
                            for (var i = 0; i < tags.length; i++) {
                                tagsFormated.push({
                                    name: tags[i].name,
                                    count: parseInt(tags[i].count)
                                })
                            }
                            allArtists[index].tags = tagsFormated;

                            allTagsNode = allTagsNode.concat(tagsFormated);

                        }

                    }
                    else {
                        console.error("Data retreived by artist.getTopTags seems to be in an incorrect format, it can happen since the API has report of not working correctly.. Here are the data anyways: ", JSON.stringify(data));

                    }
                    cbEach();
                },
                error: function(error) {
                    console.error("Error artist.getTopTags: " + error);
                    //return cbEach("Error while retreiving an info for an artist " + error.message)
                    cbEach();
                }
            }

        });

    }, function(err) {
        if (err) return callback(err);

        console.info("number of total tags ", allTagsNode.length);
        allTagsNode = combineCount(allTagsNode);
        console.info("number of unique tags ", allTagsNode.length);
        callback(null, allArtists, allTagsNode);
    });



    //Take an array of tagsNode and combine its tags by summing it's count value
    //This is a typical job for MapReduce (plus mongoose really faciliate it)
    //However, since it is very unlikely that this database will one day become huge
    //It is a bit of a waste of time to store all artist (with their tags) first to retreive
    //them to do a mapReduce batch to then store it again.
    //I would do it if I wanted to scale the app for a way bigger db
    //I would also have not keeped all the artist in memory and have inserted/updated in batch (of let's say 1k)
    function combineCount(tagsNodes) {
        var holder = {};
        tagsNodes.forEach(function(d) {
            if (holder.hasOwnProperty(d.name)) {
                holder[d.name] = holder[d.name] + d.count;
            }
            else {
                holder[d.name] = d.count;
            }
        });
        var obj2 = [];
        for (var prop in holder) {
            obj2.push({
                name: prop,
                count: holder[prop]
            });
        }
        return obj2;
    }

    //This function clean each tag of format the array of tagNode
    //It uses node text-miner package even if I had fancier using R or a python package for this task
    //I ignore all words who have a count of 0, trim, lower,
    //and combine the count (it does not use Porter to stem it as I didn't
    //have time to implement a StemCompletion algorithm and it would have require 
    //a music type dictionarry)
    //It returns an array in the format of tagNode
    //TODO stemCompletion algorithm
    function cleanTags(tags) {
        //the corpus take only an array of string so I transform my data to take into consideration count
        var docs = [];
        var tag;
        var my_corpus = new tm.Corpus([]);
        var dictionarry;
        var dtm;
        for (var i = 0; i < tags.length; i++) {
            tag = tags[i];
            //This will ignore all words who have a count of 0
            //It is a bit of a waste of ressource but I figured it was worth it since it allows
            //to easily clean eveything
            for (var j = 0; j < tag.count; j++) {
                docs.push(tag.name);
            }
        }
        //Create the corpus and apply the cleaning
        //We could debate to remove or not stopwords
        //Let's be naive and believe that the community wouldn't vote too much for profanity names..
        my_corpus.addDocs(docs);
        my_corpus.trim().toLower();
        my_corpus.clean();
        //Not stemming while I don't implement the stemCompletion
        //before stemming we keep our dictionarry
        //dictionarry = my_corpus.documents;
        //my_corpus.stem("Porter");
        //TODO retreive from dictionarry
        //my_corpus.retreive(dictionnary)

        //Create a document term matrix with term with frequencies not 0 and that have a threshold higher than the min
        //This allow to remove some irrelevant tag
        //The idea is that globally you can have a tag with low frequency that can be relevant.
        //However, locally (on the artist level), if your frequency is low it means
        //The comunity overall disagree and I assume that it is irrelevant
        dtm = new tm.Terms(my_corpus);
        //Remove sparse term call because it is not working at the moment
        //TODO fix it
        //dtm = dtm.removeSparseTermsFix(0.7).findFreqTerms(1);

        //As for testing now, I just use the frequencies that are gloablly high
        dtm = dtm.findFreqTerms(20);
        var result = [];
        dtm.map(function(obj) {
            result.push({
                name: obj.word,
                count: obj.count
            });
        });

        return result;



    }
}




//================
//END 4 async task aggregateTagsNodeToArtists(allArtists, callback)
//===============




//=====================
//5 async task 
//1. var tagsimilarities = computeSimilarityTags(allArtists, allTagsUnique);
//2. var artistsSimilarities = computeSimilarityArtists(allArtists, tagsimilarities);
//3. computeComparaisonAPI(artistsSimilarities,tagsimilarities,callback);
//===================================

//5.1


//I will do the pearson correlation.
function computeSimilarityTags(allArtists, allTagsUnique) {

    //We first create a result pearson matrix filled with -2 (so if we have an error we can identify it since pearson correlation can't be -2)
    //We fill a matrix of observation with 0 (So if we don't a tag for a specific artist we consider it 0)
    //I liberately choose to use two variable as node.js is way more efficient with basic type (int) than objects
    //matrixIndexToName and matrixNameToIndex are reflective, it is just for ease of use.
    var pearsonMatrixValue = [];
    var matrixIndexToName = [];
    var matrixNameToIndex = [];
    var observationsCount = [];
    var similarTags = [];
    var nbrTag = allTagsUnique.length;
    var nbrObservation = allArtists.length;

    //init all the matrix with default value
    initMatrix();
    //calculatePearson();
    pearsonMatrixValue = calculateSimilarity(1, observationsCount, matrixIndexToName, matrixNameToIndex);
    //add for each tag it's similarities so it will be faster to query it
    createSimilarTags();

    return similarTags;

    function initMatrix() {
        var tags;
        //fill the pearson matrix with
        for (var i = 0; i < nbrTag; i++) {
            pearsonMatrixValue.push([]);
            matrixIndexToName.push(allTagsUnique[i].name);
            matrixNameToIndex[allTagsUnique[i].name] = i;
            for (var index = 0; index < nbrTag; index++) {
                pearsonMatrixValue[i].push(-2);
            }
        }
        //Fill with the observation count matrix with 0
        observationsCount = createMatrix(nbrObservation, nbrTag, 0);
        //populate the observation count matrix with the count
        for (var irow = 0; irow < allArtists.length; irow++) {
            tags = allArtists[irow].tags;
            for (var tagInd = 0; tagInd < tags.length; tagInd++) {
                var tagName = tags[tagInd].name;
                var tagCount = tags[tagInd].count;

                observationsCount[irow][matrixNameToIndex[tagName]] = tagCount;
            }
        }

    }

    function createSimilarTags() {

        var tagSim, destTags, sourceTagName, idf, countTagInArtist;
        for (var i = 0; i < allTagsUnique.length; i++) {
            tagSim = {};
            sourceTagName = allTagsUnique[i].name;
            tagSim.name = sourceTagName;
            destTags = [];
            var simivals = pearsonMatrixValue[matrixNameToIndex[sourceTagName]];
            for (var h = 0; h < simivals.length; h++) {
                destTags.push({
                    name: matrixIndexToName[h],
                    betweeness: simivals[h]
                });
            }
            tagSim.similar = destTags;
            //compute idf
            //log10(number of artist/number of artist where tag appear)
            countTagInArtist = 0;
            for (var obs in observationsCount) {
                observationsCount[obs][matrixNameToIndex[sourceTagName]] !== 0 ? countTagInArtist += 1 : null;
            }
            idf = log10(nbrObservation / countTagInArtist);
            tagSim.idf = idf;
            tagSim.count = allTagsUnique[i].count;
            tagSim.nbrArtist=countTagInArtist;
            similarTags.push(tagSim);
        }


    }

}

//================
//end 5.1
//================



//========
//5.2
//==========



//This function is close to the tag relationship one except
//This time I use the cosine relationship because I am not looking at a linear correlation
//I use tfidf as weight for cosine as some tag do not have the same significance than others
//if a tag is everywhere it is not significant
function computeSimilarityArtists(allArtists, tagsimilarities) {
    //Same logic, keep everything in matrix of number as it is faster to proceed in node.js
    //I also add it to allArtist as I believe it's value can be interesting to know
    var tags = [],
        tagName, tag, tfidf, indexUniqueTag, uTag, weightedObservations, matrixSimilarity;
    weightedObservations = createMatrix(allArtists.length, tagsimilarities.length, 0);
    for (var i = 0; i < allArtists.length; i++) {
        tags = allArtists[i].tags;
        for (var t = 0; t < tags.length; t++) {
            indexUniqueTag = indexFindByKey(tagsimilarities, "name", tags[t].name);
            if (checkNotNull(indexUniqueTag)) {
                uTag = tagsimilarities[indexUniqueTag];
                tfidf = uTag.idf * tags[t].count;
                allArtists[i].tags[t].tfidf = tfidf;
                //populate it in the matrix using the artist index and indexUniqueTag to be constant
                weightedObservations[i][indexUniqueTag] = tfidf;
            }
        }
    }
    //We now have the tfidf weight for each artists
    //We can calculate the simalirities between them with cosine
    matrixSimilarity = calculateSimilarity(0, weightedObservations, null, null);
    fillAllArtistsSimilarities();
    return allArtists;



    //The index is the same as allArtists for matrixSimilarity
    //Pretty close to tagSimilar method.. Could be refractored if I had more time
    //modify all artist to include similarities
    function fillAllArtistsSimilarities() {
        var artistSim, destArtist, sourceArtistName;
        for (var i = 0; i < allArtists.length; i++) {
            artistSim = {};
            sourceArtistName = allArtists[i].name;
            destArtist = [];
            var simivals = matrixSimilarity[i];
            for (var h = 0; h < simivals.length; h++) {
                destArtist.push({
                    name: allArtists[h].name,
                    betweeness: simivals[h]
                });
            }
            allArtists[i].similar = destArtist;
        }
    }

}

//========
//END 5.2
//========


//======
//5.3
//=======



function computeComparaisonAPI(artistsSimilarities, tagsSimilarities, gbCb) {
    async.parallel({
            artists: function(cb) {
                getArtistsSimilarity(artistsSimilarities, cb);


            },
            tagsSimilars: function(cb) {

                getTagsSimilarity(tagsSimilarities, cb);

            }
        },
        function(err, results) {
            if (err) return gbCb(err);
            console.info("finished computing similarities from API");
            gbCb(null, results);
        });

    //compute similarity between API results and my results
    //The API return the 100 artists with the highest similarities
    //One interesting thing that I noticed is that the API match
    //alway return 1 for the best match which I find somehow inacurrate
    //You can't say that everyone who listen to one artist will certainly "match" another
    //Otherwise we would match all artist at the end..
    //I have two possibles solutions at hand:
    //Either I weight my result to be according to matches (highest betweenes become 1) and I calculate the distance from it
    //by using a rank correllation algorithm such as Spearman
    //Or I just do a Jaccard to simply compare data both set, ignoring the rank. 
    //It is less precise than any rank algorithm since it doesn't take into consideration the rank
    //I already know that their algorithm take another factor (which I can't access) which is the intersection
    //of listenners (how many people listen to artist A and B)
    //It influence their matches (in addition to the tags)
    //Therefore, I know in advance that my rank weight will be different than their
    //It will most likely lead to different overall rank
    //In consequence I decided to just do a Jaccardi algorithm
    function getArtistsSimilarity(artistsSimilarities, cb) {

            var artistsNames = getNames(artistsSimilarities);


            async.each(artistsNames, function(name, cbEach) {
                lastfm.request("artist.getSimilar", {
                    artist: name,
                    handlers: {
                        success: function(data) {
                            var aElementApi, artist, artistName, index, aElement, x, y, apiSimilarity;
                            //we check that we have data in the correct format
                            if (checkNotNull(data['similarartists']) && checkNotNull(data['similarartists']['@attr']) && checkNotNull(data['similarartists']['artist'])) {
                                artistName = data['similarartists']['@attr'].artist;
                                aElementApi = data['similarartists']['artist'];

                                //Clean tag to avoid having duplicate or tag with count of 0
                                aElementApi = aElementApi.map(function(elem) {
                                    return elem.name
                                });

                                //Now we get the artist data from the name.
                                index = indexFindByKey(artistsSimilarities, "name", artistName);

                                if (index !== null) {
                                    artist = artistsSimilarities[index];
                                    aElement = artist.similar;
                                    //Get the 100 first tag to match with the API
                                    aElement = selectTop(aElement, "betweeness", 100);
                                    aElement = artist.similar.map(function(elem) {
                                        return elem.name
                                    });
                                    x = toLowerArray(aElementApi);
                                    y = toLowerArray(aElement);
                                    apiSimilarity = jaccard.index(x, y);

                                    //retreive it it
                                    artistsSimilarities[index].apiSimilarity = apiSimilarity;
                                }

                            }
                            else {
                                console.error("Data retreived by artist.getSimilar seems to be in an incorrect format, it can happen since the API has report of not working correctly.. Here are the data anyways: ", JSON.stringify(data));

                            }
                            cbEach();
                        },
                        error: function(error) {
                            console.error("Error artist.getSimilar: " + error);
                            //return cbEach("Error while retreiving an info for an artist " + error.message)
                            cbEach();
                        }
                    }

                });

            }, function(err) {
                if (err) return cb(err);
                cb(null, artistsSimilarities);
            });
        }
        //compute similarity between API results and my results
        //The API return only 50 elements and sadly there isn't any metric
        //I don't even know if the results are ordered..
        //Therefore in order to not compare apples with oranges
        //I am going to simply use the Jaccard similarity 
        //TODO refractor it with the getArtistSimilarity
    function getTagsSimilarity(tagsSimilarities, cb) {


        var names = getNames(tagsSimilarities);
        async.each(names, function(name, cbEach) {
            lastfm.request("tag.getSimilar", {
                tag: name,
                handlers: {
                    success: function(data) {
                        var aElementApi, tagSim, tagName, index, aElement, x, y, apiSimilarity;
                        //we check that we have data in the correct format
                        if (checkNotNull(data['similartags']) && checkNotNull(data['similartags']['@attr']) && checkNotNull(data['similartags']['tag'])) {
                            tagName = data['similartags']['@attr'].tag;
                            aElementApi = data['similartags']['tag'];
                            //get tag api names
                            aElementApi = aElementApi.map(function(elem) {
                                return elem.name
                            });
                            //Now we get the tag data from the name and aggregate its tags.
                            index = indexFindByKey(tagsSimilarities, "name", tagName);

                            if (index !== null) {
                                tagSim = tagsSimilarities[index];
                                aElement = tagSim.similar;

                                //Get the 50 first tag to match with the API
                                aElement = selectTop(aElement, "betweeness", 50);

                                aElement = tagSim.similar.map(function(elem) {
                                    return elem.name
                                });
                                x = toLowerArray(aElementApi);
                                y = toLowerArray(aElement);
                                apiSimilarity = jaccard.index(x, y);

                                //insert in our object
                                tagsSimilarities[index].apiSimilarity = apiSimilarity;
                            }

                        }
                        else {
                            console.error("Data retreived by tag.getSimilar seems to be in an incorrect format, it can happen since the API has report of not working correctly.. Here are the data anyways: ", JSON.stringify(data));

                        }
                        cbEach();
                    },
                    error: function(error) {
                        console.error("Error tag.getSimilar: " + JSON.stringify(error));
                        //return cbEach("Error while retreiving an info for a tag " + error.message)
                        cbEach();
                    }
                }

            });

        }, function(err) {
            if (err) return cb(err);
            cb(null, tagsSimilarities);
        });


    }
}



//======
//END 5.3
//=======

//=====
//END Async task 5
//=======

//============
//Async task 6
//storeData(dbObject,callback);
//================


function storeData(dbObject, callback) {
    var artists = dbObject.artists;
    var tagsSimilars = dbObject.tagsSimilars;
    async.parallel([function(cbParallel) {
            async.each(artists, function(artist, cbEach) {
                Artist.update({
                    name: artist.name
                }, artist, {
                    upsert: true
                }, cbEach)
            }, cbParallel);

        },
        function(cbParallel) {
            async.each(tagsSimilars, function(tag, cbEach) {
                TagSimilar.update({
                    name: tag.name
                }, tag, {
                    upsert: true
                }, cbEach)
            }, cbParallel);

        }
    ], function(err, results) {
        if (err) return callback(err);
        console.info("Successfully inserted documents");
        callback();
    })

}



//================
//End async task 6
//==========


//==============
//Helpers functions
//=====================


//Filter and return only the top maxResult of array in decreasing order minus the top 1 since it is yourself (in my structure)
function selectTop(array, key, maxResult) {
    array = array.sort(function(a, b) {
        return parseFloat(b[key]) - parseFloat(a[key])
    });
    return array.slice(1, maxResult + 1);

}

//calculate the log10
function log10(x) {
    return Math.log(x) / Math.LN10;
}

//Create a 2D array of dim:dimRow x dimColumn filled with fillValue
function createMatrix(dimRow, dimColumn, fillValue) {
    var matrix = [];
    for (var row = 0; row < dimRow; row++) {
        matrix.push([]);
        for (var column = 0; column < dimColumn; column++) {
            matrix[row].push(fillValue);
        }

    }
    return matrix;
}



//Generic function to calculate similarity
//if pearson=1 use pearson otherwise use cosine
//indexToName,nameToIndex is only used for pearson (should be optimized)
//TODO optimize my pearson code to do a rotation of the valMatrix so I won't have to treat it very differently
function calculateSimilarity(pearson, valMatrix, indexToName, nameToIndex) {

    var alreadyCalculated, x, y, xtag, ytag, matrixSimilarity, simVal, invalidTest;
    if (pearson) {
        matrixSimilarity = createMatrix(valMatrix[0].length, valMatrix[0].length, -2);
        invalidTest = 0;
    }
    else {
        matrixSimilarity = createMatrix(valMatrix.length, valMatrix.length, -2);
    }
    for (var row = 0; row < matrixSimilarity.length; row++) {
        alreadyCalculated = false;
        for (var col = 0; col < matrixSimilarity.length; col++) {
            //if we haven't yet calculated the pearson correllation
            if (!alreadyCalculated) {
                //if indexes are the same it means that we want to do the correllation between x and x which we know is 1 already.    
                if (col === row) {
                    matrixSimilarity[row][col] = 1;
                    alreadyCalculated = true;
                }
                else {
                    if (pearson) {
                        xtag = indexToName[row];
                        ytag = indexToName[col];
                        x = [];
                        y = [];
                        //for each observation we retreive the value of the specific tags
                        //TODO optimize by transforming the matrix observation count to not have to look for every tag
                        //So i can combine it with the cosine algorithm
                        for (var h = 0; h < valMatrix.length; h++) {
                            x.push(valMatrix[h][nameToIndex[xtag]]);
                            y.push(valMatrix[h][nameToIndex[ytag]]);
                        }
                        //Removing the test since we don't have enough data and C9 is really not happy
                         //if (ttest(x, y,{alpha:0.9}).valid()) {
                            simVal = getPearsonsCorrelation(x, y);

                            matrixSimilarity[row][col] = round(simVal, 5);
                        //}
                        //else {
                            //invalidTest++;
                        //}

                    }
                    else {
                        x = valMatrix[row];
                        y = valMatrix[col];
                        simVal = getCosine(x, y)
                        matrixSimilarity[row][col] = round(simVal, 5);
                    }
                }
            }
        }
    }

    //Fill it with the missing values
    for (var a = 0; a < matrixSimilarity.length; a++) {
        for (var b = 0; b < matrixSimilarity.length; b++) {
            if (b > a) {

                matrixSimilarity[a][b] = matrixSimilarity[b][a];
            }
        }
    }

    //if (pearson) {
    //    console.info("There was ", invalidTest, " who were ingored because of invalid p_value");

    //}
    return matrixSimilarity;
}


//Round a number to defined decimals
function round(num, numDecimals) {
    var multiplier = Math.pow(10, numDecimals);

    return (Math.round(num * multiplier) / multiplier);
}



//return an array of name from an array of object who have a key name
function getNames(collection) {
    return collection.reduce(function(collection, elem) {
        return collection.concat(elem.name);
    }, []);
}

//Find an object in an array by a specific value of its key
//caution: consider that the key is unique
//return only one index (the first one found) or null if not found 
function indexFindByKey(array, key, value) {
        for (var i = 0; i < array.length; i++) {
            if (array[i][key] === value) {
                return i;
            }
        }
        return null;
    }
    //When retreiving data from JSON it is often a headache to know if a field is present or not
    //This function is a helper to do so
function checkNotNull(variable) {
    return !(typeof(variable) === 'undefined' || variable === null);
}

//Calculate the cosine similarity between a and b
function getCosine(a, b) {
    var ii = a.length,
        p = 0,
        p2 = 0,
        q2 = 0,
        answer;
    for (var i = 0; i < ii; i++) {
        p += a[i] * b[i];
        p2 += a[i] * a[i];
        q2 += b[i] * b[i];
    }
    answer = p / (Math.sqrt(p2) * Math.sqrt(q2));
    if (isNaN(answer)) return 0;
    return answer;
};



// Calculate the pearsons correlation for two passed in arrays
// Credit to Steve Gardner for this function
// http://stevegardner.net/2012/06/11/javascript-code-to-calculate-the-pearson-correlation-coefficient/
function getPearsonsCorrelation(x, y) {
    var shortestArrayLength = 0;
    if (x.length == y.length) {
        shortestArrayLength = x.length;
    }
    else if (x.length > y.length) {
        shortestArrayLength = y.length;
        console.error('x has more items in it, the last ' + (x.length - shortestArrayLength) + ' item(s) will be ignored');
    }
    else {
        shortestArrayLength = x.length;
        console.error('y has more items in it, the last ' + (y.length - shortestArrayLength) + ' item(s) will be ignored');
    }

    var xy = [];
    var x2 = [];
    var y2 = [];

    for (var i = 0; i < shortestArrayLength; i++) {
        xy.push(x[i] * y[i]);
        x2.push(x[i] * x[i]);
        y2.push(y[i] * y[i]);
    }

    var sum_x = 0;
    var sum_y = 0;
    var sum_xy = 0;
    var sum_x2 = 0;
    var sum_y2 = 0;

    for (var i = 0; i < shortestArrayLength; i++) {
        sum_x += x[i];
        sum_y += y[i];
        sum_xy += xy[i];
        sum_x2 += x2[i];
        sum_y2 += y2[i];
    }

    var step1 = (shortestArrayLength * sum_xy) - (sum_x * sum_y);
    var step2 = (shortestArrayLength * sum_x2) - (sum_x * sum_x);
    var step3 = (shortestArrayLength * sum_y2) - (sum_y * sum_y);
    var step4 = Math.sqrt(step2 * step3);
    var answer = step1 / step4;

    if (isNaN(answer)) return 0;
    return answer;
};


//Array to lower case array of strings
function toLowerArray(array){
   return array.map(function(value) {

    return value.toLowerCase();
});
}
