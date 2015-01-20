$( document ).ready(function() {
    console.log("yo");
var matrix=[],row=[],tmpRow;
for (var i=0;i<data.length;i++){
    row=data[i];
    tmpRow=[]
    for (var k=0;k<row.length;k++){
        tmpRow.push({name:names[k],value:row[k]});
    }
    matrix.push(tmpRow);
}
console.log("heyy",matrix);






      //*******************************************************************
      //  CREATE MATRIX AND MAP
      //*******************************************************************
      
        var mpr = chordMpr(matrix);
        var i=0;
        _.each(matrix, function (elem) {
           
          mpr.addToMap(names[i])
          i++;
        })

        mpr.setFilter(function (row, a, b) {
            console.log("filter",row,a,b);
            return  (true);
          })
          .setAccessor(function (recs, a, b) {
            console.log(recs,a,b)  
            if (!recs[0]) return 0;
            return recs[a.id][[b.id]].value;
          });
          console.log("hereeeeeee",mpr.getMatrix(), mpr.getMap());
        drawChords(mpr.getMatrix(), mpr.getMap());
      

      //*******************************************************************
      //  DRAW THE CHORD DIAGRAM
      //*******************************************************************
      function drawChords (matrix, mmap) {
        var w = 980, h = 800, r1 = h / 2, r0 = r1 - 100;

        var fill = d3.scale.ordinal()
            .range(["#F7E3AF", "#C08497", "#B0D0D3", "#F7AF9D","#CBC5FF",
                      "#F9CDC9","#D0E3C4","#D4CDAB","#F0544F","#A42CD6"]);

        var chord = d3.layout.chord()
            .padding(.04)
            .sortSubgroups(d3.descending)
            .sortChords(d3.descending);

        var arc = d3.svg.arc()
            .innerRadius(r0)
            .outerRadius(r0 + 20);

        var svg = d3.select("body").append("svg:svg")
            .attr("width", w)
            .attr("height", h)
          .append("svg:g")
            .attr("id", "circle")
            .attr("transform", "translate(" + w / 2 + "," + h / 2 + ")");

            svg.append("circle")
                .attr("r", r0 + 20);

        var rdr = chordRdr(matrix, mmap);
        chord.matrix(matrix);

        var g = svg.selectAll("g.group")
            .data(chord.groups())
          .enter().append("svg:g")
            .attr("class", "group")
            .on("mouseover", mouseover)
            .on("mouseout", function (d) { d3.select("#tooltip").style("visibility", "hidden") });

        g.append("svg:path")
            .style("stroke", "black")
            .style("fill", function(d) { return fill(rdr(d).gname); })
            .attr("d", arc);

        g.append("svg:text")
            .each(function(d) { d.angle = (d.startAngle + d.endAngle) / 2; })
            .attr("dy", ".35em")
            .style("font-family", "helvetica, arial, sans-serif")
            .style("font-size", "10px")
            .attr("text-anchor", function(d) { return d.angle > Math.PI ? "end" : null; })
            .attr("transform", function(d) {
              return "rotate(" + (d.angle * 180 / Math.PI - 90) + ")"
                  + "translate(" + (r0 + 26) + ")"
                  + (d.angle > Math.PI ? "rotate(180)" : "");
            })
            .text(function(d) { return rdr(d).gname; });

          var chordPaths = svg.selectAll("path.chord")
                .data(chord.chords())
              .enter().append("svg:path")
                .attr("class", "chord")
                .style("stroke", function(d) { return d3.rgb(fill(rdr(d).sname)).darker(); })
                .style("fill", function(d) { return fill(rdr(d).sname); })
                .attr("d", d3.svg.chord().radius(r0))
                .on("mouseover", function (d) {
                  d3.select("#tooltip")
                    .style("visibility", "visible")
                    .html(chordTip(rdr(d)))
                    .style("top", function () { return (d3.event.pageY - 170)+"px"})
                    .style("left", function () { return (d3.event.pageX - 100)+"px";})
                })
                .on("mouseout", function (d) { d3.select("#tooltip").style("visibility", "hidden") });

          function chordTip (d) {
            var p = d3.format(".1%"), q = d3.format(",.2r")
            return "Chord Info:<br/>"
              +  d.sname + " ↔ " + d.tname
              + ": " + p(d.svalue) + " similar <br/>";
          }

          function groupTip (d) {
            var p = d3.format(".1%"), q = d3.format(",.2r")
            return "Group Info: "+ d.gname +"<br/>"+
                 "Total average similarity: "
                + p(d.gvalue/matrix.length)
          }

          function mouseover(d, i) {
            d3.select("#tooltip")
              .style("visibility", "visible")
              .html(groupTip(rdr(d)))
              .style("top", function () { return (d3.event.pageY - 80)+"px"})
              .style("left", function () { return (d3.event.pageX - 130)+"px";})

            chordPaths.classed("fade", function(p) {
              return p.source.index != i
                  && p.target.index != i;
            });
          }
      }

















});
