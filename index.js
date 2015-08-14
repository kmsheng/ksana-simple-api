var kse=require("ksana-search");
var kde=require("ksana-database");
var bsearch=kde.bsearch;

//make sure db is opened
var nextUti=function(opts,cb){
	kde.open(opts.db,function(err,db){
		if (err) cb(err);
		else cb(0,db.nextTxtid(opts.uti));
	});		
}
//make sure db is opened
var prevUti=function(opts,cb){
	kde.open(opts.db,function(err,db){
		if (err) cb(err);
		else cb(0,db.prevTxtid(opts.uti));
	});		
}

var next=function(opts,cb,context) {
	kse.search(opts.db,opts.q,function(err,res){
		var db=res.engine;
		if (err) {
			cb(err);
			return;
		}
		var out=[];
		var next=opts.uti;
		var count=opts.count||10;
		for (var i=0;i<count;i++) {
			var next=db.nextTxtid(next);
			if (!next) break;
			out.push(next);
		}
		opts.uti=out;
		fetch(opts,cb,context);
	});
}
var prev=function(opts,cb,context) {
}

var toc=function(opts,cb,context) {
	var that=this;
	kse.search(opts.db,opts.q,{},function(err,res){
		if (err) {
			cb(err);
		} else {
			var tocname=res.engine.get("meta").toc;
			res.engine.getTOC({tocname:tocname},function(data){
				cb(0,{name:tocname,toc:data,hits:res.rawresult,tocname:tocname});
			});
		}
	});
}

var txtids2key=function(txtids) {
	if (typeof txtids!="object") {
		txtids=[txtids];
	}
	var out=[];
	for (var i=0;i<txtids.length;i++) {
		var fseg=this.txtid2fileSeg(txtids[i]);
		out.push(["filecontents",fseg.file,fseg.seg]);
	}
	return out;
}

var hits2markup=function( Q,file,seg, text){
	var seg1=this.fileSegToAbsSeg(file,seg);
	var vpos=this.absSegToVpos(seg1);
	var vpos2=this.absSegToVpos(seg1+1);
	var hits=kse.excerpt.realHitInRange(Q,vpos,vpos2,text);
	return hits;
}
var fetch=function(opts,cb,context) {
	var that=this;
	if (!opts.uti && !opts.vpos) {
		cb("missing uti or vpos");
		return;
	}
	kse.search(opts.db,opts.q,{},function(err,res){
		if (err) {
			cb(err);
		} else {
			var uti=opts.uti;
			if (!uti) {
				uti=[];
				var vpos=opts.vpos;
				if (typeof vpos!="object") vpos=[vpos];
				for (var i=0;i<vpos.length;i++) {
					uti.push(res.engine.vpos2txtid(vpos[i]));
				}
			}
			var keys=txtids2key.call(res.engine,uti);
			if (typeof keys[0][1]=="undefined") {
				cb("uti not found: "+uti+" in "+opts.db);
				return;
			}

			res.engine.get(keys,function(data){
				var out=[];
				for (var i=0;i<keys.length;i++) {
					var hits=hits2markup.call(res.engine,res,keys[i][1],keys[i][2],data[i]);
					var vpos=res.engine.txtid2vpos(uti[i]);
					out.push({uti:uti[i],text:data[i],hits:hits,vpos:vpos});
				}
				cb(0,out);
			});
		}
	});	
}

var excerpt2defaultoutput=function(excerpt) {
	var out=[];
	for (var i=0;i<excerpt.length;i++) {
		var ex=excerpt[i];
		var vpos=this.fileSegToVpos(ex.file,ex.seg);
		var txtid=this.vpos2txtid(vpos);
		out.push({uti:txtid,text:ex.text,hits:ex.realHits});
	}
	return out;
}
//use startfrom to specifiy starting posting
var excerpt=function(opts,cb,context) {
	var that=this;
	if (!opts.q) {
		cb("missing q");
		return;
	}
	kse.search(opts.db,opts.q,{nohighlight:true,range:{from:opts.from}},
		function(err,res){
		if (err) {
			cb(err);
		} else {
			//console.log(res.rawresult)
			cb(0,excerpt2defaultoutput.call(res.engine,res.excerpt));
		}
	});	
}

var beginWith=function(s,txtids) {
	var out=[];
	for (var i=1;i<s.length;i++) {
		tofind=s.substr(0,i);
		var idx=bsearch(txtids,tofind);
		if (idx>-1) out.push(txtids[idx]);
	}
	return out;
}
var scan=function(opts,cb,context) {
	kse.search(opts.db,opts.q,{},function(err,res){
		if (err) {
			cb(err);
			return;
		}
		var db=res.engine;
		var out=[];
		var txtid=db.get("txtid");
		for (var i=0;i<opts.sentence.length;i++) {
			var q=opts.sentence.substr(i);
			out=out.concat(beginWith(q,txtid));
		}
		cb(0,out);
	});
}

var filterField=function(items,regex) {
	var reg=new RegExp(regex);
	var out=[];
	for (var i=0;i<items.length;i++) {
		var item=items[i];
		if (item.match(reg)) {
			out.push(item);
		}
	}
	return out;
}

var filter=function(opts,cb,context) {
	kse.search(opts.db,opts.q,{},function(err,res){
		if (err) {
			cb(err);
			return;
		}
		var db=res.engine;
		var out=[];

		if (opts.field) {
			values=db.get(["fields",opts.field],function(data){
				var matches=filterField(data,opts.regex);
				cb(0,matches);
			});
		} else {//use uti
			var values=db.get("txtid");
			var matches=filterField(values,opts.regex);
			cb(0,matches);
		}
	});
}
var listkdb=kde.listkdb;


var fillHits=function(searchable,tofind,cb) {
	var taskqueue=[],out=[];
	for (var i=0;i<searchable.length;i++) {
		(function(dbname){
			taskqueue.push(function(err,data){
				if (typeof data=='object' && data.__empty) {
					//not pushing the first call
				} else {
					searchable.map(function(db){
						if (db.shortname===data.dbname) {
							db.hits=data.rawresult.length;
						}
					})
				}
				kse.search(dbname,tofind,taskqueue.shift(0,data));
			});;
		})(searchable[i].fullname)
	};

	taskqueue.push(function(err,data){

		searchable.sort(function(a,b){
			return b.hits-a.hits;
		});

		cb(searchable);
	});
	taskqueue.shift()(0,{__empty:true});
}

var API={
	next:next,
	prev:prev,
	nextUti:nextUti,
	prevUti:prevUti,	
	toc:toc,
	fetch:fetch,
	excerpt:excerpt,
	scan:scan,
	filter:filter,
	listkdb:listkdb,
	fillHits:fillHits
}
module.exports=API;