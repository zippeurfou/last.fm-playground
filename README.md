
##Introduction

This is an example of the usage of the last.fm api. It was created in 4 days for a work sample for a job interview.

## What it does

* Get the current top Artists
* Get their tags associated
 * Clean the tags that are too few in number and format it better (trim, lower it)
* Compute the probability of associations 
 * For artists use Pearson coefficient
 * For tags use cosine with tfidf weight
* Store everything in a mongodb database

## Bonus
Just go [here](http://zippeurfou.ddns.net/node) ;-)

## Configure it

edit config.json


## Run
     $ node bin/www

## Architecture of the app

lastfmPuller.js is the main file. It does all the collection and calculation of similarity.
The rest is kinda the web part with a typical express architecture.


## Known issues

According to [last.fm forum](http://www.lastfm.fr/forum/21713/_/598337) and my observations, the `playcount` and `listeners` in `chart.getTopArtists` are for the past 6 months.
Therefore, the ranking is actually based on the number of listeners for the past 6 months which express more a trend than an overall ranking.
i.e. There might be this new artist which is really hype and have been listenned a lot in the past 6 month. He might appear first in the query `chart.getTopArtists` but overall he is far from the top Artists.

In order to be consistant in my metric, I populate `listeners` and `playcount` from `artist.getInfo` which are the overall informations.
However, this is extremely costy as I have to do an additionnal query for each artist... 

An alternative solution should be found if we want to scale it.
