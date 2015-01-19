//Note
//In a perfect world I would have made one file per Schema but this being just a proof of concept app, I tried to be quicker and putted everything in the same file
//You can notice that similar has the same structure for TagSchema and ArtistSchema
//I decided to not create a new field Schema for it as I actually don't need to access specific node
//Whenever I want to know who is similar I access everything
// set up mongoose
var mongoose = require('mongoose');
var Schema = mongoose.Schema;



//Tag here refer to the one you get when you query an Artist or a track, it contain a count which is the number of click  
var TagNodeSchema = new Schema({
     name: {type: String, required:true},
     count: Number,
     //tfidf represent how important the tag is to the artists
     //The closer to 1 it is, the more chance this tag is relevant for the artist
     //tfidf=count of this node*global idf of node
     tfidf:Number
})


var ArtistSchema = new Schema({
     //I consider the name of the artist as being unique and my identifier
     name: { type: String, required:true,index: { unique: true, dropDups: true }},
     playcount: Number,
     listeners: Number,
     //mbid: { type: String, index: { unique: true, dropDups: true }} ,
     //Changed it to not unique as it is sometimes equal to '""' which will cause unwanted duplicate
     mbid:String,
     //I could have used reference but following the doc http://docs.mongodb.org/v2.6/MongoDB-data-models-guide.pdf, I used embededd
     //as it is faster in my case for atomic operations and we won't reach the 16MB limit of BSON
     tags:[TagNodeSchema],
     //This use cosine simalirity algorithm with tfidf weight
     similar:[{name:String,betweeness:Number}],
     apiSimilarity:Number
});


//Tag here refer to the similarity tags, I decided to not follow the Artist.similar syntax
// (and tweak TagNodeSchema to add a similar field) as I believe it would have been
//more confusing to have two "kinds" of tags under the same schema
//It also allow an easier access to it
//source refers to the name of the tag
//target refers to the name of the similar tags
//betweeness is P(parent and child) more is explained in lastfmPuller.js
//count represent the total number of count of this tag
var TagSimilarSchema = new Schema({
  name: { type: String, required:true,index: { unique: true, dropDups: true }},
  count:Number,
  apiSimilarity:Number,
 //The inverse document frequency is a measure of how much information the tag provides, that is, whether the term is common or rare across all artists
 //idf=log10(number of artist/number of artist where tag appear) 
  idf:Number,
  //Number of artist where this tag is present
  nbrArtist:Number,
  similar: [{name:String,betweeness:Number}]
})



//We export it so we can use it with require('./models')
exports.artistModel=mongoose.model('Artist', ArtistSchema);
exports.tagSimilarModel=mongoose.model('TagSimilar', TagSimilarSchema);



