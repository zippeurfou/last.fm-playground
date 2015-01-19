var express = require('express');
var router = express.Router();
var models = require('../models');
var TagSimilar = models.tagSimilarModel;
var  Artist = models.artistModel;



var type={
    method:["rank","list","get"],
    object:["tag","artist"]
}
//Very quickly done and very ugly code...
router.route('/:method/:object/:field?/:limit?').get(function(req, res) {
    var method=req.params.method.toLowerCase();
    var object=req.params.object.toLowerCase();
    var field=req.params.field;
    var limit=req.params.limit;
    console.log(req.params);
    var query;
    if (type.object[0]==object){
         query=TagSimilar.find();
    }
    else if(type.object[1]==(object)){
        query=Artist.find();
    }
    else{
        return res.send(new Error("Could not understand the object searched "+object));
    }
    
    //top
     if(type.method[0]== (method)){
        if(!field){
            query=query.select("name apiSimilarity count nbrArtist").sort("-apiSimilarity");
                
        }else{
           if(! isNaN(parseInt(field))){
               query=query.limit(field);
           }else{
               query=query.sort(field)
           }
        }
    }
    else if(type.method[1]== (method)){
        if(field){
            if(! isNaN(parseInt(field))){
               query=query.limit(field);
           }else{
            query=query.select(field);
           }
        }
    }
    
    else if(type.method[2]== (method)){
        if(field){
            if(! isNaN(parseInt(field))){
               query=query.limit(field);
           }else{
            query=query.where('name').equals(field);
           }
        }
    }
    if(! isNaN(parseInt(limit))){
        query.limit(limit);
    }

    
        query.exec(function(err,elem){
            render(res,err,elem);
        });
});


function render(res,err,elem){
         if (err) {
        console.log("errr is",err);
      return res.send(err);
    }
    
    res.json(elem);
}
module.exports = router;

