var express = require('express');
var router = express.Router();
var models = require('../models');
var TagSimilar = models.tagSimilarModel;
var  Artist = models.artistModel;
var async=require("async");
//This is a work in progress

/* GET home page. */
router.get('/', function(req, res, next) {
  //Let's get all the similarities so we can create two chord charts between similarities
  res.render('chartsIndex', { title: 'LastFm playground app charts' });
});

//This is a work in progress
router.get('/:type/:name', function(req, res, next) {
  var type=req.params.type;
  var sname=req.params.name;
  var query;
  if (type=="artist"){
  
  query=Artist;
    
  }
  else if(type=="tag"){
    query=TagSimilar;
  }else{
    return res.send(new Error("Could not understand the object searched "+res.type));
  }
  
  query.find({name:sname},function(err,elem){
    if(elem&&elem[0]&&elem[0].similar){
      var top20=selectTop(elem[0].similar,"betweeness",10);
      var arrayNames=top20.map(function (e){return e.name});
      var arrayIndex=[];
      var matrixSimilarity=[];
      var simValue=top20.map(function (e){
        var result;
        if((!isNaN(e.betweeness)&&e.name!=sname&&e.betweeness>0)) return e.betweeness;
        return 0;
      });
      matrixSimilarity.push(simValue)
       for (var j=0;j<arrayNames.length;j++){
         arrayIndex[arrayNames[j]]=j;
       }
       async.eachSeries(arrayNames, function(name, cbEach){
         if(name==sname){cbEach(null)}else{
         query.find({name:name},function(e,elem){
           var simval=-2;
           var n=elem[0].name;
           console.log(n);
           elem=elem[0].similar;
           var toInsert=[];
           for (var k=0;k<arrayNames.length;k++){
               var found=false;
             for (var l=0;l<elem.length;l++){
               if (elem[l].name==arrayNames[k]){
                 
                 toInsert.push((!isNaN(elem[l].betweeness)&&elem[l].name!=n&&elem[l].betweeness>0)?elem[l].betweeness:0);
                 found=true;
                 break;
               }
             }
             if (!found){toInsert.push(0);}
           }
           matrixSimilarity.push(toInsert);
          cbEach(null,toInsert); 
         })}
       }, function(err,result){
          
           res.render('charts', { data: matrixSimilarity,title:"chart for "+sname,names:arrayNames });
       });
       
       
    }
  })
  
});
//Filter and return only the top maxResult of array in decreasing order minus the top 1 since it is yourself (in my structure)
function selectTop(array, key, maxResult) {
    array = array.sort(function(a, b) {
        return parseFloat(b[key]) - parseFloat(a[key])
    });
    return array.slice(0, maxResult);

}

module.exports = router;
