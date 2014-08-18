// This object will hold all exports.
var Haste = {};

/* Thunk
   Creates a thunk representing the given closure.
   Since we want automatic memoization of as many expressions as possible, we
   use a JS object as a sort of tagged pointer, where the member x denotes the
   object actually pointed to. If a "pointer" points to a thunk, it has a
   member 't' which is set to true; if it points to a value, be it a function,
   a value of an algebraic type of a primitive value, it has no member 't'.
*/

function T(f) {
    this.f = new F(f);
}

function F(f) {
    this.f = f;
}

/* Apply
   Applies the function f to the arguments args. If the application is under-
   saturated, a closure is returned, awaiting further arguments. If it is over-
   saturated, the function is fully applied, and the result (assumed to be a
   function) is then applied to the remaining arguments.
*/
function A(f, args) {
    if(f instanceof T) {
        f = E(f);
    }
    // Closure does some funny stuff with functions that occasionally
    // results in non-functions getting applied, so we have to deal with
    // it.
    if(!(f instanceof Function)) {
        return f;
    }

    if(f.arity === undefined) {
        f.arity = f.length;
    }
    if(args.length === f.arity) {
        switch(f.arity) {
            case 0:  return f();
            case 1:  return f(args[0]);
            default: return f.apply(null, args);
        }
    } else if(args.length > f.arity) {
        switch(f.arity) {
            case 0:  return f();
            case 1:  return A(f(args.shift()), args);
            default: return A(f.apply(null, args.splice(0, f.arity)), args);
        }
    } else {
        var g = function() {
            return A(f, args.concat(Array.prototype.slice.call(arguments)));
        };
        g.arity = f.arity - args.length;
        return g;
    }
}

/* Eval
   Evaluate the given thunk t into head normal form.
   If the "thunk" we get isn't actually a thunk, just return it.
*/
function E(t) {
    if(t instanceof T) {
        if(t.f instanceof F) {
            return t.f = t.f.f();
        } else {
            return t.f;
        }
    } else {
        return t;
    }
}

// Export Haste, A and E. Haste because we need to preserve exports, A and E
// because they're handy for Haste.Foreign.
if(!window) {
    var window = {};
}
window['Haste'] = Haste;
window['A'] = A;
window['E'] = E;


/* Throw an error.
   We need to be able to use throw as an exception so we wrap it in a function.
*/
function die(err) {
    throw err;
}

function quot(a, b) {
    return (a-a%b)/b;
}

function quotRemI(a, b) {
    return [0, (a-a%b)/b, a%b];
}

// 32 bit integer multiplication, with correct overflow behavior
// note that |0 or >>>0 needs to be applied to the result, for int and word
// respectively.
function imul(a, b) {
  // ignore high a * high a as the result will always be truncated
  var lows = (a & 0xffff) * (b & 0xffff); // low a * low b
  var aB = (a & 0xffff) * (b & 0xffff0000); // low a * high b
  var bA = (a & 0xffff0000) * (b & 0xffff); // low b * high a
  return lows + aB + bA; // sum will not exceed 52 bits, so it's safe
}

function addC(a, b) {
    var x = a+b;
    return [0, x & 0xffffffff, x > 0x7fffffff];
}

function subC(a, b) {
    var x = a-b;
    return [0, x & 0xffffffff, x < -2147483648];
}

function sinh (arg) {
    return (Math.exp(arg) - Math.exp(-arg)) / 2;
}

function tanh (arg) {
    return (Math.exp(arg) - Math.exp(-arg)) / (Math.exp(arg) + Math.exp(-arg));
}

function cosh (arg) {
    return (Math.exp(arg) + Math.exp(-arg)) / 2;
}

// Scratch space for byte arrays.
var rts_scratchBuf = new ArrayBuffer(8);
var rts_scratchW32 = new Uint32Array(rts_scratchBuf);
var rts_scratchFloat = new Float32Array(rts_scratchBuf);
var rts_scratchDouble = new Float64Array(rts_scratchBuf);

function decodeFloat(x) {
    rts_scratchFloat[0] = x;
    var sign = x < 0 ? -1 : 1;
    var exp = ((rts_scratchW32[0] >> 23) & 0xff) - 150;
    var man = rts_scratchW32[0] & 0x7fffff;
    if(exp === 0) {
        ++exp;
    } else {
        man |= (1 << 23);
    }
    return [0, sign*man, exp];
}

function decodeDouble(x) {
    rts_scratchDouble[0] = x;
    var sign = x < 0 ? -1 : 1;
    var manHigh = rts_scratchW32[1] & 0xfffff;
    var manLow = rts_scratchW32[0];
    var exp = ((rts_scratchW32[1] >> 20) & 0x7ff) - 1075;
    if(exp === 0) {
        ++exp;
    } else {
        manHigh |= (1 << 20);
    }
    return [0, sign, manHigh, manLow, exp];
}

function isFloatFinite(x) {
    return isFinite(x);
}

function isDoubleFinite(x) {
    return isFinite(x);
}

function err(str) {
    die(toJSStr(str));
}

/* unpackCString#
   NOTE: update constructor tags if the code generator starts munging them.
*/
function unCStr(str) {return unAppCStr(str, [0]);}

function unFoldrCStr(str, f, z) {
    var acc = z;
    for(var i = str.length-1; i >= 0; --i) {
        acc = A(f, [[0, str.charCodeAt(i)], acc]);
    }
    return acc;
}

function unAppCStr(str, chrs) {
    var i = arguments[2] ? arguments[2] : 0;
    if(i >= str.length) {
        return E(chrs);
    } else {
        return [1,[0,str.charCodeAt(i)],new T(function() {
            return unAppCStr(str,chrs,i+1);
        })];
    }
}

function charCodeAt(str, i) {return str.charCodeAt(i);}

function fromJSStr(str) {
    return unCStr(E(str));
}

function toJSStr(hsstr) {
    var s = '';
    for(var str = E(hsstr); str[0] == 1; str = E(str[2])) {
        s += String.fromCharCode(E(str[1])[1]);
    }
    return s;
}

// newMutVar
function nMV(val) {
    return ({x: val});
}

// readMutVar
function rMV(mv) {
    return mv.x;
}

// writeMutVar
function wMV(mv, val) {
    mv.x = val;
}

// atomicModifyMutVar
function mMV(mv, f) {
    var x = A(f, [mv.x]);
    mv.x = x[1];
    return x[2];
}

function localeEncoding() {
    var le = newByteArr(5);
    le['b']['i8'] = 'U'.charCodeAt(0);
    le['b']['i8'] = 'T'.charCodeAt(0);
    le['b']['i8'] = 'F'.charCodeAt(0);
    le['b']['i8'] = '-'.charCodeAt(0);
    le['b']['i8'] = '8'.charCodeAt(0);
    return le;
}

var isDoubleNaN = isNaN;
var isFloatNaN = isNaN;

function isDoubleInfinite(d) {
    return (d === Infinity);
}
var isFloatInfinite = isDoubleInfinite;

function isDoubleNegativeZero(x) {
    return (x===0 && (1/x)===-Infinity);
}
var isFloatNegativeZero = isDoubleNegativeZero;

function strEq(a, b) {
    return a == b;
}

function strOrd(a, b) {
    if(a < b) {
        return [0];
    } else if(a == b) {
        return [1];
    }
    return [2];
}

function jsCatch(act, handler) {
    try {
        return A(act,[0]);
    } catch(e) {
        return A(handler,[e, 0]);
    }
}

var coercionToken = undefined;

/* Haste represents constructors internally using 1 for the first constructor,
   2 for the second, etc.
   However, dataToTag should use 0, 1, 2, etc. Also, booleans might be unboxed.
 */
function dataToTag(x) {
    if(x instanceof Array) {
        return x[0];
    } else {
        return x;
    }
}

function __word_encodeDouble(d, e) {
    return d * Math.pow(2,e);
}

var __word_encodeFloat = __word_encodeDouble;
var jsRound = Math.round; // Stupid GHC doesn't like periods in FFI IDs...
var realWorld = undefined;
if(typeof _ == 'undefined') {
    var _ = undefined;
}

function popCnt(i) {
    i = i - ((i >> 1) & 0x55555555);
    i = (i & 0x33333333) + ((i >> 2) & 0x33333333);
    return (((i + (i >> 4)) & 0x0F0F0F0F) * 0x01010101) >> 24;
}

function jsAlert(val) {
    if(typeof alert != 'undefined') {
        alert(val);
    } else {
        print(val);
    }
}

function jsLog(val) {
    console.log(val);
}

function jsPrompt(str) {
    var val;
    if(typeof prompt != 'undefined') {
        val = prompt(str);
    } else {
        print(str);
        val = readline();
    }
    return val == undefined ? '' : val.toString();
}

function jsEval(str) {
    var x = eval(str);
    return x == undefined ? '' : x.toString();
}

function isNull(obj) {
    return obj === null;
}

function jsRead(str) {
    return Number(str);
}

function jsShowI(val) {return val.toString();}
function jsShow(val) {
    var ret = val.toString();
    return val == Math.round(val) ? ret + '.0' : ret;
}

function jsGetMouseCoords(e) {
    var posx = 0;
    var posy = 0;
    if (!e) var e = window.event;
    if (e.pageX || e.pageY) 	{
	posx = e.pageX;
	posy = e.pageY;
    }
    else if (e.clientX || e.clientY) 	{
	posx = e.clientX + document.body.scrollLeft
	    + document.documentElement.scrollLeft;
	posy = e.clientY + document.body.scrollTop
	    + document.documentElement.scrollTop;
    }
    return [posx - (e.currentTarget.offsetLeft || 0),
	    posy - (e.currentTarget.offsetTop || 0)];
}

function jsSetCB(elem, evt, cb) {
    // Count return press in single line text box as a change event.
    if(evt == 'change' && elem.type.toLowerCase() == 'text') {
        setCB(elem, 'keyup', function(k) {
            if(k == '\n'.charCodeAt(0)) {
                A(cb,[[0,k.keyCode],0]);
            }
        });
    }

    var fun;
    switch(evt) {
    case 'click':
    case 'dblclick':
    case 'mouseup':
    case 'mousedown':
        fun = function(x) {
            var mpos = jsGetMouseCoords(x);
            var mx = [0,mpos[0]];
            var my = [0,mpos[1]];
            A(cb,[[0,x.button],[0,mx,my],0]);
        };
        break;
    case 'mousemove':
    case 'mouseover':
        fun = function(x) {
            var mpos = jsGetMouseCoords(x);
            var mx = [0,mpos[0]];
            var my = [0,mpos[1]];
            A(cb,[[0,mx,my],0]);
        };
        break;
    case 'keypress':
    case 'keyup':
    case 'keydown':
        fun = function(x) {A(cb,[[0,x.keyCode],0]);};
        break;        
    default:
        fun = function() {A(cb,[0]);};
        break;
    }
    return setCB(elem, evt, fun);
}

function setCB(elem, evt, cb) {
    if(elem.addEventListener) {
        elem.addEventListener(evt, cb, false);
        return true;
    } else if(elem.attachEvent) {
        elem.attachEvent('on'+evt, cb);
        return true;
    }
    return false;
}

function jsSetTimeout(msecs, cb) {
    window.setTimeout(function() {A(cb,[0]);}, msecs);
}

function jsGet(elem, prop) {
    return elem[prop].toString();
}

function jsSet(elem, prop, val) {
    elem[prop] = val;
}

function jsGetAttr(elem, prop) {
    if(elem.hasAttribute(prop)) {
        return elem.getAttribute(prop).toString();
    } else {
        return "";
    }
}

function jsSetAttr(elem, prop, val) {
    elem.setAttribute(prop, val);
}

function jsGetStyle(elem, prop) {
    return elem.style[prop].toString();
}

function jsSetStyle(elem, prop, val) {
    elem.style[prop] = val;
}

function jsKillChild(child, parent) {
    parent.removeChild(child);
}

function jsClearChildren(elem) {
    while(elem.hasChildNodes()){
        elem.removeChild(elem.lastChild);
    }
}

function jsFind(elem) {
    var e = document.getElementById(elem)
    if(e) {
        return [1,[0,e]];
    }
    return [0];
}

function jsCreateElem(tag) {
    return document.createElement(tag);
}

function jsCreateTextNode(str) {
    return document.createTextNode(str);
}

function jsGetChildBefore(elem) {
    elem = elem.previousSibling;
    while(elem) {
        if(typeof elem.tagName != 'undefined') {
            return [1,[0,elem]];
        }
        elem = elem.previousSibling;
    }
    return [0];
}

function jsGetLastChild(elem) {
    var len = elem.childNodes.length;
    for(var i = len-1; i >= 0; --i) {
        if(typeof elem.childNodes[i].tagName != 'undefined') {
            return [1,[0,elem.childNodes[i]]];
        }
    }
    return [0];
}


function jsGetFirstChild(elem) {
    var len = elem.childNodes.length;
    for(var i = 0; i < len; i++) {
        if(typeof elem.childNodes[i].tagName != 'undefined') {
            return [1,[0,elem.childNodes[i]]];
        }
    }
    return [0];
}


function jsGetChildren(elem) {
    var children = [0];
    var len = elem.childNodes.length;
    for(var i = len-1; i >= 0; --i) {
        if(typeof elem.childNodes[i].tagName != 'undefined') {
            children = [1, [0,elem.childNodes[i]], children];
        }
    }
    return children;
}

function jsSetChildren(elem, children) {
    children = E(children);
    jsClearChildren(elem, 0);
    while(children[0] === 1) {
        elem.appendChild(E(E(children[1])[1]));
        children = E(children[2]);
    }
}

function jsAppendChild(child, container) {
    container.appendChild(child);
}

function jsAddChildBefore(child, container, after) {
    container.insertBefore(child, after);
}

var jsRand = Math.random;

// Concatenate a Haskell list of JS strings
function jsCat(strs, sep) {
    var arr = [];
    strs = E(strs);
    while(strs[0]) {
        strs = E(strs);
        arr.push(E(strs[1])[1]);
        strs = E(strs[2]);
    }
    return arr.join(sep);
}

var jsJSONParse = JSON.parse;

// JSON stringify a string
function jsStringify(str) {
    return JSON.stringify(str);
}

// Parse a JSON message into a Haste.JSON.JSON value.
// As this pokes around inside Haskell values, it'll need to be updated if:
// * Haste.JSON.JSON changes;
// * E() starts to choke on non-thunks;
// * data constructor code generation changes; or
// * Just and Nothing change tags.
function jsParseJSON(str) {
    try {
        var js = JSON.parse(str);
        var hs = toHS(js);
    } catch(_) {
        return [0];
    }
    return [1,hs];
}

function toHS(obj) {
    switch(typeof obj) {
    case 'number':
        return [0, [0, jsRead(obj)]];
    case 'string':
        return [1, [0, obj]];
        break;
    case 'boolean':
        return [2, obj]; // Booleans are special wrt constructor tags!
        break;
    case 'object':
        if(obj instanceof Array) {
            return [3, arr2lst_json(obj, 0)];
        } else {
            // Object type but not array - it's a dictionary.
            // The RFC doesn't say anything about the ordering of keys, but
            // considering that lots of people rely on keys being "in order" as
            // defined by "the same way someone put them in at the other end,"
            // it's probably a good idea to put some cycles into meeting their
            // misguided expectations.
            var ks = [];
            for(var k in obj) {
                ks.unshift(k);
            }
            var xs = [0];
            for(var i = 0; i < ks.length; i++) {
                xs = [1, [0, [0,ks[i]], toHS(obj[ks[i]])], xs];
            }
            return [4, xs];
        }
    }
}

function arr2lst_json(arr, elem) {
    if(elem >= arr.length) {
        return [0];
    }
    return [1, toHS(arr[elem]), new T(function() {return arr2lst_json(arr,elem+1);})]
}

function arr2lst(arr, elem) {
    if(elem >= arr.length) {
        return [0];
    }
    return [1, arr[elem], new T(function() {return arr2lst(arr,elem+1);})]
}

function lst2arr(xs) {
    var arr = [];
    for(; xs[0]; xs = E(xs[2])) {
        arr.push(E(xs[1]));
    }
    return arr;
}

function ajaxReq(method, url, async, postdata, cb) {
    var xhr = new XMLHttpRequest();
    xhr.open(method, url, async);
    xhr.setRequestHeader('Cache-control', 'no-cache');
    xhr.onreadystatechange = function() {
        if(xhr.readyState == 4) {
            if(xhr.status == 200) {
                A(cb,[[1,[0,xhr.responseText]],0]);
            } else {
                A(cb,[[0],0]); // Nothing
            }
        }
    }
    xhr.send(postdata);
}

// Create a little endian ArrayBuffer representation of something.
function toABHost(v, n, x) {
    var a = new ArrayBuffer(n);
    new window[v](a)[0] = x;
    return a;
}

function toABSwap(v, n, x) {
    var a = new ArrayBuffer(n);
    new window[v](a)[0] = x;
    var bs = new Uint8Array(a);
    for(var i = 0, j = n-1; i < j; ++i, --j) {
        var tmp = bs[i];
        bs[i] = bs[j];
        bs[j] = tmp;
    }
    return a;
}

window['toABle'] = toABHost;
window['toABbe'] = toABSwap;

// Swap byte order if host is not little endian.
var buffer = new ArrayBuffer(2);
new DataView(buffer).setInt16(0, 256, true);
if(new Int16Array(buffer)[0] !== 256) {
    window['toABle'] = toABSwap;
    window['toABbe'] = toABHost;
}

// MVar implementation.
// Since Haste isn't concurrent, takeMVar and putMVar don't block on empty
// and full MVars respectively, but terminate the program since they would
// otherwise be blocking forever.

function newMVar() {
    return ({empty: true});
}

function tryTakeMVar(mv) {
    if(mv.empty) {
        return [0, 0, undefined];
    } else {
        var val = mv.x;
        mv.empty = true;
        mv.x = null;
        return [0, 1, val];
    }
}

function takeMVar(mv) {
    if(mv.empty) {
        // TODO: real BlockedOnDeadMVar exception, perhaps?
        err("Attempted to take empty MVar!");
    }
    var val = mv.x;
    mv.empty = true;
    mv.x = null;
    return val;
}

function putMVar(mv, val) {
    if(!mv.empty) {
        // TODO: real BlockedOnDeadMVar exception, perhaps?
        err("Attempted to put full MVar!");
    }
    mv.empty = false;
    mv.x = val;
}

function tryPutMVar(mv, val) {
    if(!mv.empty) {
        return 0;
    } else {
        mv.empty = false;
        mv.x = val;
        return 1;
    }
}

function sameMVar(a, b) {
    return (a == b);
}

function isEmptyMVar(mv) {
    return mv.empty ? 1 : 0;
}

// Implementation of stable names.
// Unlike native GHC, the garbage collector isn't going to move data around
// in a way that we can detect, so each object could serve as its own stable
// name if it weren't for the fact we can't turn a JS reference into an
// integer.
// So instead, each object has a unique integer attached to it, which serves
// as its stable name.

var __next_stable_name = 1;

function makeStableName(x) {
    if(!x.stableName) {
        x.stableName = __next_stable_name;
        __next_stable_name += 1;
    }
    return x.stableName;
}

function eqStableName(x, y) {
    return (x == y) ? 1 : 0;
}

var Integer = function(bits, sign) {
  this.bits_ = [];
  this.sign_ = sign;

  var top = true;
  for (var i = bits.length - 1; i >= 0; i--) {
    var val = bits[i] | 0;
    if (!top || val != sign) {
      this.bits_[i] = val;
      top = false;
    }
  }
};

Integer.IntCache_ = {};

var I_fromInt = function(value) {
  if (-128 <= value && value < 128) {
    var cachedObj = Integer.IntCache_[value];
    if (cachedObj) {
      return cachedObj;
    }
  }

  var obj = new Integer([value | 0], value < 0 ? -1 : 0);
  if (-128 <= value && value < 128) {
    Integer.IntCache_[value] = obj;
  }
  return obj;
};

var I_fromNumber = function(value) {
  if (isNaN(value) || !isFinite(value)) {
    return Integer.ZERO;
  } else if (value < 0) {
    return I_negate(I_fromNumber(-value));
  } else {
    var bits = [];
    var pow = 1;
    for (var i = 0; value >= pow; i++) {
      bits[i] = (value / pow) | 0;
      pow *= Integer.TWO_PWR_32_DBL_;
    }
    return new Integer(bits, 0);
  }
};

var I_fromBits = function(bits) {
  var high = bits[bits.length - 1];
  return new Integer(bits, high & (1 << 31) ? -1 : 0);
};

var I_fromString = function(str, opt_radix) {
  if (str.length == 0) {
    throw Error('number format error: empty string');
  }

  var radix = opt_radix || 10;
  if (radix < 2 || 36 < radix) {
    throw Error('radix out of range: ' + radix);
  }

  if (str.charAt(0) == '-') {
    return I_negate(I_fromString(str.substring(1), radix));
  } else if (str.indexOf('-') >= 0) {
    throw Error('number format error: interior "-" character');
  }

  var radixToPower = I_fromNumber(Math.pow(radix, 8));

  var result = Integer.ZERO;
  for (var i = 0; i < str.length; i += 8) {
    var size = Math.min(8, str.length - i);
    var value = parseInt(str.substring(i, i + size), radix);
    if (size < 8) {
      var power = I_fromNumber(Math.pow(radix, size));
      result = I_add(I_mul(result, power), I_fromNumber(value));
    } else {
      result = I_mul(result, radixToPower);
      result = I_add(result, I_fromNumber(value));
    }
  }
  return result;
};


Integer.TWO_PWR_32_DBL_ = (1 << 16) * (1 << 16);
Integer.ZERO = I_fromInt(0);
Integer.ONE = I_fromInt(1);
Integer.TWO_PWR_24_ = I_fromInt(1 << 24);

var I_toInt = function(self) {
  return self.bits_.length > 0 ? self.bits_[0] : self.sign_;
};

var I_toWord = function(self) {
  return I_toInt(self) >>> 0;
};

var I_toNumber = function(self) {
  if (isNegative(self)) {
    return -I_toNumber(I_negate(self));
  } else {
    var val = 0;
    var pow = 1;
    for (var i = 0; i < self.bits_.length; i++) {
      val += I_getBitsUnsigned(self, i) * pow;
      pow *= Integer.TWO_PWR_32_DBL_;
    }
    return val;
  }
};

var I_getBits = function(self, index) {
  if (index < 0) {
    return 0;
  } else if (index < self.bits_.length) {
    return self.bits_[index];
  } else {
    return self.sign_;
  }
};

var I_getBitsUnsigned = function(self, index) {
  var val = I_getBits(self, index);
  return val >= 0 ? val : Integer.TWO_PWR_32_DBL_ + val;
};

var getSign = function(self) {
  return self.sign_;
};

var isZero = function(self) {
  if (self.sign_ != 0) {
    return false;
  }
  for (var i = 0; i < self.bits_.length; i++) {
    if (self.bits_[i] != 0) {
      return false;
    }
  }
  return true;
};

var isNegative = function(self) {
  return self.sign_ == -1;
};

var isOdd = function(self) {
  return (self.bits_.length == 0) && (self.sign_ == -1) ||
         (self.bits_.length > 0) && ((self.bits_[0] & 1) != 0);
};

var I_equals = function(self, other) {
  if (self.sign_ != other.sign_) {
    return false;
  }
  var len = Math.max(self.bits_.length, other.bits_.length);
  for (var i = 0; i < len; i++) {
    if (I_getBits(self, i) != I_getBits(other, i)) {
      return false;
    }
  }
  return true;
};

var I_notEquals = function(self, other) {
  return !I_equals(self, other);
};

var I_greaterThan = function(self, other) {
  return I_compare(self, other) > 0;
};

var I_greaterThanOrEqual = function(self, other) {
  return I_compare(self, other) >= 0;
};

var I_lessThan = function(self, other) {
  return I_compare(self, other) < 0;
};

var I_lessThanOrEqual = function(self, other) {
  return I_compare(self, other) <= 0;
};

var I_compare = function(self, other) {
  var diff = I_sub(self, other);
  if (isNegative(diff)) {
    return -1;
  } else if (isZero(diff)) {
    return 0;
  } else {
    return +1;
  }
};

var I_compareInt = function(self, other) {
  return I_compare(self, I_fromInt(other));
}

var shorten = function(self, numBits) {
  var arr_index = (numBits - 1) >> 5;
  var bit_index = (numBits - 1) % 32;
  var bits = [];
  for (var i = 0; i < arr_index; i++) {
    bits[i] = I_getBits(self, i);
  }
  var sigBits = bit_index == 31 ? 0xFFFFFFFF : (1 << (bit_index + 1)) - 1;
  var val = I_getBits(self, arr_index) & sigBits;
  if (val & (1 << bit_index)) {
    val |= 0xFFFFFFFF - sigBits;
    bits[arr_index] = val;
    return new Integer(bits, -1);
  } else {
    bits[arr_index] = val;
    return new Integer(bits, 0);
  }
};

var I_negate = function(self) {
  return I_add(not(self), Integer.ONE);
};

var I_add = function(self, other) {
  var len = Math.max(self.bits_.length, other.bits_.length);
  var arr = [];
  var carry = 0;

  for (var i = 0; i <= len; i++) {
    var a1 = I_getBits(self, i) >>> 16;
    var a0 = I_getBits(self, i) & 0xFFFF;

    var b1 = I_getBits(other, i) >>> 16;
    var b0 = I_getBits(other, i) & 0xFFFF;

    var c0 = carry + a0 + b0;
    var c1 = (c0 >>> 16) + a1 + b1;
    carry = c1 >>> 16;
    c0 &= 0xFFFF;
    c1 &= 0xFFFF;
    arr[i] = (c1 << 16) | c0;
  }
  return I_fromBits(arr);
};

var I_sub = function(self, other) {
  return I_add(self, I_negate(other));
};

var I_mul = function(self, other) {
  if (isZero(self)) {
    return Integer.ZERO;
  } else if (isZero(other)) {
    return Integer.ZERO;
  }

  if (isNegative(self)) {
    if (isNegative(other)) {
      return I_mul(I_negate(self), I_negate(other));
    } else {
      return I_negate(I_mul(I_negate(self), other));
    }
  } else if (isNegative(other)) {
    return I_negate(I_mul(self, I_negate(other)));
  }

  if (I_lessThan(self, Integer.TWO_PWR_24_) &&
      I_lessThan(other, Integer.TWO_PWR_24_)) {
    return I_fromNumber(I_toNumber(self) * I_toNumber(other));
  }

  var len = self.bits_.length + other.bits_.length;
  var arr = [];
  for (var i = 0; i < 2 * len; i++) {
    arr[i] = 0;
  }
  for (var i = 0; i < self.bits_.length; i++) {
    for (var j = 0; j < other.bits_.length; j++) {
      var a1 = I_getBits(self, i) >>> 16;
      var a0 = I_getBits(self, i) & 0xFFFF;

      var b1 = I_getBits(other, j) >>> 16;
      var b0 = I_getBits(other, j) & 0xFFFF;

      arr[2 * i + 2 * j] += a0 * b0;
      Integer.carry16_(arr, 2 * i + 2 * j);
      arr[2 * i + 2 * j + 1] += a1 * b0;
      Integer.carry16_(arr, 2 * i + 2 * j + 1);
      arr[2 * i + 2 * j + 1] += a0 * b1;
      Integer.carry16_(arr, 2 * i + 2 * j + 1);
      arr[2 * i + 2 * j + 2] += a1 * b1;
      Integer.carry16_(arr, 2 * i + 2 * j + 2);
    }
  }

  for (var i = 0; i < len; i++) {
    arr[i] = (arr[2 * i + 1] << 16) | arr[2 * i];
  }
  for (var i = len; i < 2 * len; i++) {
    arr[i] = 0;
  }
  return new Integer(arr, 0);
};

Integer.carry16_ = function(bits, index) {
  while ((bits[index] & 0xFFFF) != bits[index]) {
    bits[index + 1] += bits[index] >>> 16;
    bits[index] &= 0xFFFF;
  }
};

var I_mod = function(self, other) {
  return I_rem(I_add(other, I_rem(self, other)), other);
}

var I_div = function(self, other) {
  if(I_greaterThan(self, Integer.ZERO) != I_greaterThan(other, Integer.ZERO)) {
    if(I_rem(self, other) != Integer.ZERO) {
      return I_sub(I_quot(self, other), Integer.ONE);
    }
  }
  return I_quot(self, other);
}

var I_quotRem = function(self, other) {
  return [0, I_quot(self, other), I_rem(self, other)];
}

var I_divMod = function(self, other) {
  return [0, I_div(self, other), I_mod(self, other)];
}

var I_quot = function(self, other) {
  if (isZero(other)) {
    throw Error('division by zero');
  } else if (isZero(self)) {
    return Integer.ZERO;
  }

  if (isNegative(self)) {
    if (isNegative(other)) {
      return I_quot(I_negate(self), I_negate(other));
    } else {
      return I_negate(I_quot(I_negate(self), other));
    }
  } else if (isNegative(other)) {
    return I_negate(I_quot(self, I_negate(other)));
  }

  var res = Integer.ZERO;
  var rem = self;
  while (I_greaterThanOrEqual(rem, other)) {
    var approx = Math.max(1, Math.floor(I_toNumber(rem) / I_toNumber(other)));
    var log2 = Math.ceil(Math.log(approx) / Math.LN2);
    var delta = (log2 <= 48) ? 1 : Math.pow(2, log2 - 48);
    var approxRes = I_fromNumber(approx);
    var approxRem = I_mul(approxRes, other);
    while (isNegative(approxRem) || I_greaterThan(approxRem, rem)) {
      approx -= delta;
      approxRes = I_fromNumber(approx);
      approxRem = I_mul(approxRes, other);
    }

    if (isZero(approxRes)) {
      approxRes = Integer.ONE;
    }

    res = I_add(res, approxRes);
    rem = I_sub(rem, approxRem);
  }
  return res;
};

var I_rem = function(self, other) {
  return I_sub(self, I_mul(I_quot(self, other), other));
};

var not = function(self) {
  var len = self.bits_.length;
  var arr = [];
  for (var i = 0; i < len; i++) {
    arr[i] = ~self.bits_[i];
  }
  return new Integer(arr, ~self.sign_);
};

var I_and = function(self, other) {
  var len = Math.max(self.bits_.length, other.bits_.length);
  var arr = [];
  for (var i = 0; i < len; i++) {
    arr[i] = I_getBits(self, i) & I_getBits(other, i);
  }
  return new Integer(arr, self.sign_ & other.sign_);
};

var I_or = function(self, other) {
  var len = Math.max(self.bits_.length, other.bits_.length);
  var arr = [];
  for (var i = 0; i < len; i++) {
    arr[i] = I_getBits(self, i) | I_getBits(other, i);
  }
  return new Integer(arr, self.sign_ | other.sign_);
};

var I_xor = function(self, other) {
  var len = Math.max(self.bits_.length, other.bits_.length);
  var arr = [];
  for (var i = 0; i < len; i++) {
    arr[i] = I_getBits(self, i) ^ I_getBits(other, i);
  }
  return new Integer(arr, self.sign_ ^ other.sign_);
};

var I_shiftLeft = function(self, numBits) {
  var arr_delta = numBits >> 5;
  var bit_delta = numBits % 32;
  var len = self.bits_.length + arr_delta + (bit_delta > 0 ? 1 : 0);
  var arr = [];
  for (var i = 0; i < len; i++) {
    if (bit_delta > 0) {
      arr[i] = (I_getBits(self, i - arr_delta) << bit_delta) |
               (I_getBits(self, i - arr_delta - 1) >>> (32 - bit_delta));
    } else {
      arr[i] = I_getBits(self, i - arr_delta);
    }
  }
  return new Integer(arr, self.sign_);
};

var I_shiftRight = function(self, numBits) {
  var arr_delta = numBits >> 5;
  var bit_delta = numBits % 32;
  var len = self.bits_.length - arr_delta;
  var arr = [];
  for (var i = 0; i < len; i++) {
    if (bit_delta > 0) {
      arr[i] = (I_getBits(self, i + arr_delta) >>> bit_delta) |
               (I_getBits(self, i + arr_delta + 1) << (32 - bit_delta));
    } else {
      arr[i] = I_getBits(self, i + arr_delta);
    }
  }
  return new Integer(arr, self.sign_);
};

var I_signum = function(self) {
  var cmp = I_compare(self, Integer.ZERO);
  if(cmp > 0) {
    return Integer.ONE
  }
  if(cmp < 0) {
    return I_sub(Integer.ZERO, Integer.ONE);
  }
  return Integer.ZERO;
};

var I_abs = function(self) {
  if(I_compare(self, Integer.ZERO) < 0) {
    return I_sub(Integer.ZERO, self);
  }
  return self;
};

var I_decodeDouble = function(x) {
  var dec = decodeDouble(x);
  var mantissa = I_fromBits([dec[3], dec[2]]);
  if(dec[1] < 0) {
    mantissa = I_negate(mantissa);
  }
  return [0, dec[4], mantissa];
}

var I_toString = function(self) {
  var radix = 10;

  if (isZero(self)) {
    return '0';
  } else if (isNegative(self)) {
    return '-' + I_toString(I_negate(self));
  }

  var radixToPower = I_fromNumber(Math.pow(radix, 6));

  var rem = self;
  var result = '';
  while (true) {
    var remDiv = I_div(rem, radixToPower);
    var intval = I_toInt(I_sub(rem, I_mul(remDiv, radixToPower)));
    var digits = intval.toString();

    rem = remDiv;
    if (isZero(rem)) {
      return digits + result;
    } else {
      while (digits.length < 6) {
        digits = '0' + digits;
      }
      result = '' + digits + result;
    }
  }
};

var I_fromRat = function(a, b) {
    return I_toNumber(a) / I_toNumber(b);
}

function I_fromInt64(x) {
    return I_fromBits([x.getLowBits(), x.getHighBits()]);
}

function I_toInt64(x) {
    return Long.fromBits(I_getBits(x, 0), I_getBits(x, 1));
}

function I_fromWord64(x) {
    return x;
}

function I_toWord64(x) {
    return I_rem(I_add(__w64_max, x), __w64_max);
}

// Copyright 2009 The Closure Library Authors. All Rights Reserved.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS-IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

var Long = function(low, high) {
  this.low_ = low | 0;
  this.high_ = high | 0;
};

Long.IntCache_ = {};

Long.fromInt = function(value) {
  if (-128 <= value && value < 128) {
    var cachedObj = Long.IntCache_[value];
    if (cachedObj) {
      return cachedObj;
    }
  }

  var obj = new Long(value | 0, value < 0 ? -1 : 0);
  if (-128 <= value && value < 128) {
    Long.IntCache_[value] = obj;
  }
  return obj;
};

Long.fromNumber = function(value) {
  if (isNaN(value) || !isFinite(value)) {
    return Long.ZERO;
  } else if (value <= -Long.TWO_PWR_63_DBL_) {
    return Long.MIN_VALUE;
  } else if (value + 1 >= Long.TWO_PWR_63_DBL_) {
    return Long.MAX_VALUE;
  } else if (value < 0) {
    return Long.fromNumber(-value).negate();
  } else {
    return new Long(
        (value % Long.TWO_PWR_32_DBL_) | 0,
        (value / Long.TWO_PWR_32_DBL_) | 0);
  }
};

Long.fromBits = function(lowBits, highBits) {
  return new Long(lowBits, highBits);
};

Long.TWO_PWR_16_DBL_ = 1 << 16;
Long.TWO_PWR_24_DBL_ = 1 << 24;
Long.TWO_PWR_32_DBL_ =
    Long.TWO_PWR_16_DBL_ * Long.TWO_PWR_16_DBL_;
Long.TWO_PWR_31_DBL_ =
    Long.TWO_PWR_32_DBL_ / 2;
Long.TWO_PWR_48_DBL_ =
    Long.TWO_PWR_32_DBL_ * Long.TWO_PWR_16_DBL_;
Long.TWO_PWR_64_DBL_ =
    Long.TWO_PWR_32_DBL_ * Long.TWO_PWR_32_DBL_;
Long.TWO_PWR_63_DBL_ =
    Long.TWO_PWR_64_DBL_ / 2;
Long.ZERO = Long.fromInt(0);
Long.ONE = Long.fromInt(1);
Long.NEG_ONE = Long.fromInt(-1);
Long.MAX_VALUE =
    Long.fromBits(0xFFFFFFFF | 0, 0x7FFFFFFF | 0);
Long.MIN_VALUE = Long.fromBits(0, 0x80000000 | 0);
Long.TWO_PWR_24_ = Long.fromInt(1 << 24);

Long.prototype.toInt = function() {
  return this.low_;
};

Long.prototype.toNumber = function() {
  return this.high_ * Long.TWO_PWR_32_DBL_ +
         this.getLowBitsUnsigned();
};

Long.prototype.getHighBits = function() {
  return this.high_;
};

Long.prototype.getLowBits = function() {
  return this.low_;
};

Long.prototype.getLowBitsUnsigned = function() {
  return (this.low_ >= 0) ?
      this.low_ : Long.TWO_PWR_32_DBL_ + this.low_;
};

Long.prototype.isZero = function() {
  return this.high_ == 0 && this.low_ == 0;
};

Long.prototype.isNegative = function() {
  return this.high_ < 0;
};

Long.prototype.isOdd = function() {
  return (this.low_ & 1) == 1;
};

Long.prototype.equals = function(other) {
  return (this.high_ == other.high_) && (this.low_ == other.low_);
};

Long.prototype.notEquals = function(other) {
  return (this.high_ != other.high_) || (this.low_ != other.low_);
};

Long.prototype.lessThan = function(other) {
  return this.compare(other) < 0;
};

Long.prototype.lessThanOrEqual = function(other) {
  return this.compare(other) <= 0;
};

Long.prototype.greaterThan = function(other) {
  return this.compare(other) > 0;
};

Long.prototype.greaterThanOrEqual = function(other) {
  return this.compare(other) >= 0;
};

Long.prototype.compare = function(other) {
  if (this.equals(other)) {
    return 0;
  }

  var thisNeg = this.isNegative();
  var otherNeg = other.isNegative();
  if (thisNeg && !otherNeg) {
    return -1;
  }
  if (!thisNeg && otherNeg) {
    return 1;
  }

  if (this.subtract(other).isNegative()) {
    return -1;
  } else {
    return 1;
  }
};

Long.prototype.negate = function() {
  if (this.equals(Long.MIN_VALUE)) {
    return Long.MIN_VALUE;
  } else {
    return this.not().add(Long.ONE);
  }
};

Long.prototype.add = function(other) {
  var a48 = this.high_ >>> 16;
  var a32 = this.high_ & 0xFFFF;
  var a16 = this.low_ >>> 16;
  var a00 = this.low_ & 0xFFFF;

  var b48 = other.high_ >>> 16;
  var b32 = other.high_ & 0xFFFF;
  var b16 = other.low_ >>> 16;
  var b00 = other.low_ & 0xFFFF;

  var c48 = 0, c32 = 0, c16 = 0, c00 = 0;
  c00 += a00 + b00;
  c16 += c00 >>> 16;
  c00 &= 0xFFFF;
  c16 += a16 + b16;
  c32 += c16 >>> 16;
  c16 &= 0xFFFF;
  c32 += a32 + b32;
  c48 += c32 >>> 16;
  c32 &= 0xFFFF;
  c48 += a48 + b48;
  c48 &= 0xFFFF;
  return Long.fromBits((c16 << 16) | c00, (c48 << 16) | c32);
};

Long.prototype.subtract = function(other) {
  return this.add(other.negate());
};

Long.prototype.multiply = function(other) {
  if (this.isZero()) {
    return Long.ZERO;
  } else if (other.isZero()) {
    return Long.ZERO;
  }

  if (this.equals(Long.MIN_VALUE)) {
    return other.isOdd() ? Long.MIN_VALUE : Long.ZERO;
  } else if (other.equals(Long.MIN_VALUE)) {
    return this.isOdd() ? Long.MIN_VALUE : Long.ZERO;
  }

  if (this.isNegative()) {
    if (other.isNegative()) {
      return this.negate().multiply(other.negate());
    } else {
      return this.negate().multiply(other).negate();
    }
  } else if (other.isNegative()) {
    return this.multiply(other.negate()).negate();
  }

  if (this.lessThan(Long.TWO_PWR_24_) &&
      other.lessThan(Long.TWO_PWR_24_)) {
    return Long.fromNumber(this.toNumber() * other.toNumber());
  }

  var a48 = this.high_ >>> 16;
  var a32 = this.high_ & 0xFFFF;
  var a16 = this.low_ >>> 16;
  var a00 = this.low_ & 0xFFFF;

  var b48 = other.high_ >>> 16;
  var b32 = other.high_ & 0xFFFF;
  var b16 = other.low_ >>> 16;
  var b00 = other.low_ & 0xFFFF;

  var c48 = 0, c32 = 0, c16 = 0, c00 = 0;
  c00 += a00 * b00;
  c16 += c00 >>> 16;
  c00 &= 0xFFFF;
  c16 += a16 * b00;
  c32 += c16 >>> 16;
  c16 &= 0xFFFF;
  c16 += a00 * b16;
  c32 += c16 >>> 16;
  c16 &= 0xFFFF;
  c32 += a32 * b00;
  c48 += c32 >>> 16;
  c32 &= 0xFFFF;
  c32 += a16 * b16;
  c48 += c32 >>> 16;
  c32 &= 0xFFFF;
  c32 += a00 * b32;
  c48 += c32 >>> 16;
  c32 &= 0xFFFF;
  c48 += a48 * b00 + a32 * b16 + a16 * b32 + a00 * b48;
  c48 &= 0xFFFF;
  return Long.fromBits((c16 << 16) | c00, (c48 << 16) | c32);
};

Long.prototype.div = function(other) {
  if (other.isZero()) {
    throw Error('division by zero');
  } else if (this.isZero()) {
    return Long.ZERO;
  }

  if (this.equals(Long.MIN_VALUE)) {
    if (other.equals(Long.ONE) ||
        other.equals(Long.NEG_ONE)) {
      return Long.MIN_VALUE;
    } else if (other.equals(Long.MIN_VALUE)) {
      return Long.ONE;
    } else {
      var halfThis = this.shiftRight(1);
      var approx = halfThis.div(other).shiftLeft(1);
      if (approx.equals(Long.ZERO)) {
        return other.isNegative() ? Long.ONE : Long.NEG_ONE;
      } else {
        var rem = this.subtract(other.multiply(approx));
        var result = approx.add(rem.div(other));
        return result;
      }
    }
  } else if (other.equals(Long.MIN_VALUE)) {
    return Long.ZERO;
  }

  if (this.isNegative()) {
    if (other.isNegative()) {
      return this.negate().div(other.negate());
    } else {
      return this.negate().div(other).negate();
    }
  } else if (other.isNegative()) {
    return this.div(other.negate()).negate();
  }

  var res = Long.ZERO;
  var rem = this;
  while (rem.greaterThanOrEqual(other)) {
    var approx = Math.max(1, Math.floor(rem.toNumber() / other.toNumber()));

    var log2 = Math.ceil(Math.log(approx) / Math.LN2);
    var delta = (log2 <= 48) ? 1 : Math.pow(2, log2 - 48);

    var approxRes = Long.fromNumber(approx);
    var approxRem = approxRes.multiply(other);
    while (approxRem.isNegative() || approxRem.greaterThan(rem)) {
      approx -= delta;
      approxRes = Long.fromNumber(approx);
      approxRem = approxRes.multiply(other);
    }

    if (approxRes.isZero()) {
      approxRes = Long.ONE;
    }

    res = res.add(approxRes);
    rem = rem.subtract(approxRem);
  }
  return res;
};

Long.prototype.modulo = function(other) {
  return this.subtract(this.div(other).multiply(other));
};

Long.prototype.not = function() {
  return Long.fromBits(~this.low_, ~this.high_);
};

Long.prototype.and = function(other) {
  return Long.fromBits(this.low_ & other.low_,
                                 this.high_ & other.high_);
};

Long.prototype.or = function(other) {
  return Long.fromBits(this.low_ | other.low_,
                                 this.high_ | other.high_);
};

Long.prototype.xor = function(other) {
  return Long.fromBits(this.low_ ^ other.low_,
                                 this.high_ ^ other.high_);
};

Long.prototype.shiftLeft = function(numBits) {
  numBits &= 63;
  if (numBits == 0) {
    return this;
  } else {
    var low = this.low_;
    if (numBits < 32) {
      var high = this.high_;
      return Long.fromBits(
          low << numBits,
          (high << numBits) | (low >>> (32 - numBits)));
    } else {
      return Long.fromBits(0, low << (numBits - 32));
    }
  }
};

Long.prototype.shiftRight = function(numBits) {
  numBits &= 63;
  if (numBits == 0) {
    return this;
  } else {
    var high = this.high_;
    if (numBits < 32) {
      var low = this.low_;
      return Long.fromBits(
          (low >>> numBits) | (high << (32 - numBits)),
          high >> numBits);
    } else {
      return Long.fromBits(
          high >> (numBits - 32),
          high >= 0 ? 0 : -1);
    }
  }
};

Long.prototype.shiftRightUnsigned = function(numBits) {
  numBits &= 63;
  if (numBits == 0) {
    return this;
  } else {
    var high = this.high_;
    if (numBits < 32) {
      var low = this.low_;
      return Long.fromBits(
          (low >>> numBits) | (high << (32 - numBits)),
          high >>> numBits);
    } else if (numBits == 32) {
      return Long.fromBits(high, 0);
    } else {
      return Long.fromBits(high >>> (numBits - 32), 0);
    }
  }
};



// Int64
function hs_eqInt64(x, y) {return x.equals(y);}
function hs_neInt64(x, y) {return !x.equals(y);}
function hs_ltInt64(x, y) {return x.compare(y) < 0;}
function hs_leInt64(x, y) {return x.compare(y) <= 0;}
function hs_gtInt64(x, y) {return x.compare(y) > 0;}
function hs_geInt64(x, y) {return x.compare(y) >= 0;}
function hs_quotInt64(x, y) {return x.div(y);}
function hs_remInt64(x, y) {return x.modulo(y);}
function hs_plusInt64(x, y) {return x.add(y);}
function hs_minusInt64(x, y) {return x.subtract(y);}
function hs_timesInt64(x, y) {return x.multiply(y);}
function hs_negateInt64(x) {return x.negate();}
function hs_uncheckedIShiftL64(x, bits) {return x.shiftLeft(bits);}
function hs_uncheckedIShiftRA64(x, bits) {return x.shiftRight(bits);}
function hs_uncheckedIShiftRL64(x, bits) {return x.shiftRightUnsigned(bits);}
function hs_intToInt64(x) {return new Long(x, 0);}
function hs_int64ToInt(x) {return x.toInt();}



// Word64
function hs_wordToWord64(x) {
    return I_fromInt(x);
}
function hs_word64ToWord(x) {
    return I_toInt(x);
}
function hs_mkWord64(low, high) {
    return I_fromBits([low, high]);
}

var hs_and64 = I_and;
var hs_or64 = I_or;
var hs_xor64 = I_xor;
var __i64_all_ones = I_fromBits([0xffffffff, 0xffffffff]);
function hs_not64(x) {
    return I_xor(x, __i64_all_ones);
}
var hs_eqWord64 = I_equals;
var hs_neWord64 = I_notEquals;
var hs_ltWord64 = I_lessThan;
var hs_leWord64 = I_lessThanOrEqual;
var hs_gtWord64 = I_greaterThan;
var hs_geWord64 = I_greaterThanOrEqual;
var hs_quotWord64 = I_quot;
var hs_remWord64 = I_rem;
var __w64_max = I_fromBits([0,0,1]);
function hs_uncheckedShiftL64(x, bits) {
    return I_rem(I_shiftLeft(x, bits), __w64_max);
}
var hs_uncheckedShiftRL64 = I_shiftRight;
function hs_int64ToWord64(x) {
    var tmp = I_add(__w64_max, I_fromBits([x.getLowBits(), x.getHighBits()]));
    return I_rem(tmp, __w64_max);
}
function hs_word64ToInt64(x) {
    return Long.fromBits(I_getBits(x, 0), I_getBits(x, 1));
}

// Joseph Myers' MD5 implementation; used under the BSD license.

function md5cycle(x, k) {
var a = x[0], b = x[1], c = x[2], d = x[3];

a = ff(a, b, c, d, k[0], 7, -680876936);
d = ff(d, a, b, c, k[1], 12, -389564586);
c = ff(c, d, a, b, k[2], 17,  606105819);
b = ff(b, c, d, a, k[3], 22, -1044525330);
a = ff(a, b, c, d, k[4], 7, -176418897);
d = ff(d, a, b, c, k[5], 12,  1200080426);
c = ff(c, d, a, b, k[6], 17, -1473231341);
b = ff(b, c, d, a, k[7], 22, -45705983);
a = ff(a, b, c, d, k[8], 7,  1770035416);
d = ff(d, a, b, c, k[9], 12, -1958414417);
c = ff(c, d, a, b, k[10], 17, -42063);
b = ff(b, c, d, a, k[11], 22, -1990404162);
a = ff(a, b, c, d, k[12], 7,  1804603682);
d = ff(d, a, b, c, k[13], 12, -40341101);
c = ff(c, d, a, b, k[14], 17, -1502002290);
b = ff(b, c, d, a, k[15], 22,  1236535329);

a = gg(a, b, c, d, k[1], 5, -165796510);
d = gg(d, a, b, c, k[6], 9, -1069501632);
c = gg(c, d, a, b, k[11], 14,  643717713);
b = gg(b, c, d, a, k[0], 20, -373897302);
a = gg(a, b, c, d, k[5], 5, -701558691);
d = gg(d, a, b, c, k[10], 9,  38016083);
c = gg(c, d, a, b, k[15], 14, -660478335);
b = gg(b, c, d, a, k[4], 20, -405537848);
a = gg(a, b, c, d, k[9], 5,  568446438);
d = gg(d, a, b, c, k[14], 9, -1019803690);
c = gg(c, d, a, b, k[3], 14, -187363961);
b = gg(b, c, d, a, k[8], 20,  1163531501);
a = gg(a, b, c, d, k[13], 5, -1444681467);
d = gg(d, a, b, c, k[2], 9, -51403784);
c = gg(c, d, a, b, k[7], 14,  1735328473);
b = gg(b, c, d, a, k[12], 20, -1926607734);

a = hh(a, b, c, d, k[5], 4, -378558);
d = hh(d, a, b, c, k[8], 11, -2022574463);
c = hh(c, d, a, b, k[11], 16,  1839030562);
b = hh(b, c, d, a, k[14], 23, -35309556);
a = hh(a, b, c, d, k[1], 4, -1530992060);
d = hh(d, a, b, c, k[4], 11,  1272893353);
c = hh(c, d, a, b, k[7], 16, -155497632);
b = hh(b, c, d, a, k[10], 23, -1094730640);
a = hh(a, b, c, d, k[13], 4,  681279174);
d = hh(d, a, b, c, k[0], 11, -358537222);
c = hh(c, d, a, b, k[3], 16, -722521979);
b = hh(b, c, d, a, k[6], 23,  76029189);
a = hh(a, b, c, d, k[9], 4, -640364487);
d = hh(d, a, b, c, k[12], 11, -421815835);
c = hh(c, d, a, b, k[15], 16,  530742520);
b = hh(b, c, d, a, k[2], 23, -995338651);

a = ii(a, b, c, d, k[0], 6, -198630844);
d = ii(d, a, b, c, k[7], 10,  1126891415);
c = ii(c, d, a, b, k[14], 15, -1416354905);
b = ii(b, c, d, a, k[5], 21, -57434055);
a = ii(a, b, c, d, k[12], 6,  1700485571);
d = ii(d, a, b, c, k[3], 10, -1894986606);
c = ii(c, d, a, b, k[10], 15, -1051523);
b = ii(b, c, d, a, k[1], 21, -2054922799);
a = ii(a, b, c, d, k[8], 6,  1873313359);
d = ii(d, a, b, c, k[15], 10, -30611744);
c = ii(c, d, a, b, k[6], 15, -1560198380);
b = ii(b, c, d, a, k[13], 21,  1309151649);
a = ii(a, b, c, d, k[4], 6, -145523070);
d = ii(d, a, b, c, k[11], 10, -1120210379);
c = ii(c, d, a, b, k[2], 15,  718787259);
b = ii(b, c, d, a, k[9], 21, -343485551);

x[0] = add32(a, x[0]);
x[1] = add32(b, x[1]);
x[2] = add32(c, x[2]);
x[3] = add32(d, x[3]);

}

function cmn(q, a, b, x, s, t) {
a = add32(add32(a, q), add32(x, t));
return add32((a << s) | (a >>> (32 - s)), b);
}

function ff(a, b, c, d, x, s, t) {
return cmn((b & c) | ((~b) & d), a, b, x, s, t);
}

function gg(a, b, c, d, x, s, t) {
return cmn((b & d) | (c & (~d)), a, b, x, s, t);
}

function hh(a, b, c, d, x, s, t) {
return cmn(b ^ c ^ d, a, b, x, s, t);
}

function ii(a, b, c, d, x, s, t) {
return cmn(c ^ (b | (~d)), a, b, x, s, t);
}

function md51(s) {
var n = s.length,
state = [1732584193, -271733879, -1732584194, 271733878], i;
for (i=64; i<=s.length; i+=64) {
md5cycle(state, md5blk(s.substring(i-64, i)));
}
s = s.substring(i-64);
var tail = [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0];
for (i=0; i<s.length; i++)
tail[i>>2] |= s.charCodeAt(i) << ((i%4) << 3);
tail[i>>2] |= 0x80 << ((i%4) << 3);
if (i > 55) {
md5cycle(state, tail);
for (i=0; i<16; i++) tail[i] = 0;
}
tail[14] = n*8;
md5cycle(state, tail);
return state;
}

function md5blk(s) {
var md5blks = [], i;
for (i=0; i<64; i+=4) {
md5blks[i>>2] = s.charCodeAt(i)
+ (s.charCodeAt(i+1) << 8)
+ (s.charCodeAt(i+2) << 16)
+ (s.charCodeAt(i+3) << 24);
}
return md5blks;
}

var hex_chr = '0123456789abcdef'.split('');

function rhex(n)
{
var s='', j=0;
for(; j<4; j++)
s += hex_chr[(n >> (j * 8 + 4)) & 0x0F]
+ hex_chr[(n >> (j * 8)) & 0x0F];
return s;
}

function hex(x) {
for (var i=0; i<x.length; i++)
x[i] = rhex(x[i]);
return x.join('');
}

function md5(s) {
return hex(md51(s));
}

function add32(a, b) {
return (a + b) & 0xFFFFFFFF;
}

// Functions for dealing with arrays.

function newArr(n, x) {
    var arr = [];
    for(; n >= 0; --n) {
        arr.push(x);
    }
    return arr;
}

// Create all views at once; perhaps it's wasteful, but it's better than having
// to check for the right view at each read or write.
function newByteArr(n) {
    // Pad the thing to multiples of 8.
    var padding = 8 - n % 8;
    if(padding < 8) {
        n += padding;
    }
    var arr = {};
    var buffer = new ArrayBuffer(n);
    var views = {};
    views['i8']  = new Int8Array(buffer);
    views['i16'] = new Int16Array(buffer);
    views['i32'] = new Int32Array(buffer);
    views['w8']  = new Uint8Array(buffer);
    views['w16'] = new Uint16Array(buffer);
    views['w32'] = new Uint32Array(buffer);
    views['f32'] = new Float32Array(buffer);
    views['f64'] = new Float64Array(buffer);
    arr['b'] = buffer;
    arr['v'] = views;
    // ByteArray and Addr are the same thing, so keep an offset if we get
    // casted.
    arr['off'] = 0;
    return arr;
}

// An attempt at emulating pointers enough for ByteString and Text to be
// usable without patching the hell out of them.
// The general idea is that Addr# is a byte array with an associated offset.

function plusAddr(addr, off) {
    var newaddr = {};
    newaddr['off'] = addr['off'] + off;
    newaddr['b']   = addr['b'];
    newaddr['v']   = addr['v'];
    return newaddr;
}

function writeOffAddr(type, elemsize, addr, off, x) {
    addr['v'][type][addr.off/elemsize + off] = x;
}

function readOffAddr(type, elemsize, addr, off) {
    return addr['v'][type][addr.off/elemsize + off];
}

// Two addresses are equal if they point to the same buffer and have the same
// offset. For other comparisons, just use the offsets - nobody in their right
// mind would check if one pointer is less than another, completely unrelated,
// pointer and then act on that information anyway.
function addrEq(a, b) {
    if(a == b) {
        return true;
    }
    return a && b && a['b'] == b['b'] && a['off'] == b['off'];
}

function addrLT(a, b) {
    if(a) {
        return b && a['off'] < b['off'];
    } else {
        return (b != 0); 
    }
}

function addrGT(a, b) {
    if(b) {
        return a && a['off'] > b['off'];
    } else {
        return (a != 0);
    }
}

function withChar(f, charCode) {
    return f(String.fromCharCode(charCode)).charCodeAt(0);
}

function u_towlower(charCode) {
    return withChar(function(c) {return c.toLowerCase()}, charCode);
}

function u_towupper(charCode) {
    return withChar(function(c) {return c.toUpperCase()}, charCode);
}

var u_towtitle = u_towupper;

function u_iswupper(charCode) {
    var c = String.fromCharCode(charCode);
    return c == c.toUpperCase() && c != c.toLowerCase();
}

function u_iswlower(charCode) {
    var c = String.fromCharCode(charCode);
    return  c == c.toLowerCase() && c != c.toUpperCase();
}

function u_iswdigit(charCode) {
    return charCode >= 48 && charCode <= 57;
}

function u_iswcntrl(charCode) {
    return charCode <= 0x1f || charCode == 0x7f;
}

function u_iswspace(charCode) {
    var c = String.fromCharCode(charCode);
    return c.replace(/\s/g,'') != c;
}

function u_iswalpha(charCode) {
    var c = String.fromCharCode(charCode);
    return c.replace(__hs_alphare, '') != c;
}

function u_iswalnum(charCode) {
    return u_iswdigit(charCode) || u_iswalpha(charCode);
}

function u_iswprint(charCode) {
    return !u_iswcntrl(charCode);
}

function u_gencat(c) {
    throw 'u_gencat is only supported with --full-unicode.';
}

// Regex that matches any alphabetic character in any language. Horrible thing.
var __hs_alphare = /[\u0041-\u005A\u0061-\u007A\u00AA\u00B5\u00BA\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u02C1\u02C6-\u02D1\u02E0-\u02E4\u02EC\u02EE\u0370-\u0374\u0376\u0377\u037A-\u037D\u0386\u0388-\u038A\u038C\u038E-\u03A1\u03A3-\u03F5\u03F7-\u0481\u048A-\u0527\u0531-\u0556\u0559\u0561-\u0587\u05D0-\u05EA\u05F0-\u05F2\u0620-\u064A\u066E\u066F\u0671-\u06D3\u06D5\u06E5\u06E6\u06EE\u06EF\u06FA-\u06FC\u06FF\u0710\u0712-\u072F\u074D-\u07A5\u07B1\u07CA-\u07EA\u07F4\u07F5\u07FA\u0800-\u0815\u081A\u0824\u0828\u0840-\u0858\u08A0\u08A2-\u08AC\u0904-\u0939\u093D\u0950\u0958-\u0961\u0971-\u0977\u0979-\u097F\u0985-\u098C\u098F\u0990\u0993-\u09A8\u09AA-\u09B0\u09B2\u09B6-\u09B9\u09BD\u09CE\u09DC\u09DD\u09DF-\u09E1\u09F0\u09F1\u0A05-\u0A0A\u0A0F\u0A10\u0A13-\u0A28\u0A2A-\u0A30\u0A32\u0A33\u0A35\u0A36\u0A38\u0A39\u0A59-\u0A5C\u0A5E\u0A72-\u0A74\u0A85-\u0A8D\u0A8F-\u0A91\u0A93-\u0AA8\u0AAA-\u0AB0\u0AB2\u0AB3\u0AB5-\u0AB9\u0ABD\u0AD0\u0AE0\u0AE1\u0B05-\u0B0C\u0B0F\u0B10\u0B13-\u0B28\u0B2A-\u0B30\u0B32\u0B33\u0B35-\u0B39\u0B3D\u0B5C\u0B5D\u0B5F-\u0B61\u0B71\u0B83\u0B85-\u0B8A\u0B8E-\u0B90\u0B92-\u0B95\u0B99\u0B9A\u0B9C\u0B9E\u0B9F\u0BA3\u0BA4\u0BA8-\u0BAA\u0BAE-\u0BB9\u0BD0\u0C05-\u0C0C\u0C0E-\u0C10\u0C12-\u0C28\u0C2A-\u0C33\u0C35-\u0C39\u0C3D\u0C58\u0C59\u0C60\u0C61\u0C85-\u0C8C\u0C8E-\u0C90\u0C92-\u0CA8\u0CAA-\u0CB3\u0CB5-\u0CB9\u0CBD\u0CDE\u0CE0\u0CE1\u0CF1\u0CF2\u0D05-\u0D0C\u0D0E-\u0D10\u0D12-\u0D3A\u0D3D\u0D4E\u0D60\u0D61\u0D7A-\u0D7F\u0D85-\u0D96\u0D9A-\u0DB1\u0DB3-\u0DBB\u0DBD\u0DC0-\u0DC6\u0E01-\u0E30\u0E32\u0E33\u0E40-\u0E46\u0E81\u0E82\u0E84\u0E87\u0E88\u0E8A\u0E8D\u0E94-\u0E97\u0E99-\u0E9F\u0EA1-\u0EA3\u0EA5\u0EA7\u0EAA\u0EAB\u0EAD-\u0EB0\u0EB2\u0EB3\u0EBD\u0EC0-\u0EC4\u0EC6\u0EDC-\u0EDF\u0F00\u0F40-\u0F47\u0F49-\u0F6C\u0F88-\u0F8C\u1000-\u102A\u103F\u1050-\u1055\u105A-\u105D\u1061\u1065\u1066\u106E-\u1070\u1075-\u1081\u108E\u10A0-\u10C5\u10C7\u10CD\u10D0-\u10FA\u10FC-\u1248\u124A-\u124D\u1250-\u1256\u1258\u125A-\u125D\u1260-\u1288\u128A-\u128D\u1290-\u12B0\u12B2-\u12B5\u12B8-\u12BE\u12C0\u12C2-\u12C5\u12C8-\u12D6\u12D8-\u1310\u1312-\u1315\u1318-\u135A\u1380-\u138F\u13A0-\u13F4\u1401-\u166C\u166F-\u167F\u1681-\u169A\u16A0-\u16EA\u1700-\u170C\u170E-\u1711\u1720-\u1731\u1740-\u1751\u1760-\u176C\u176E-\u1770\u1780-\u17B3\u17D7\u17DC\u1820-\u1877\u1880-\u18A8\u18AA\u18B0-\u18F5\u1900-\u191C\u1950-\u196D\u1970-\u1974\u1980-\u19AB\u19C1-\u19C7\u1A00-\u1A16\u1A20-\u1A54\u1AA7\u1B05-\u1B33\u1B45-\u1B4B\u1B83-\u1BA0\u1BAE\u1BAF\u1BBA-\u1BE5\u1C00-\u1C23\u1C4D-\u1C4F\u1C5A-\u1C7D\u1CE9-\u1CEC\u1CEE-\u1CF1\u1CF5\u1CF6\u1D00-\u1DBF\u1E00-\u1F15\u1F18-\u1F1D\u1F20-\u1F45\u1F48-\u1F4D\u1F50-\u1F57\u1F59\u1F5B\u1F5D\u1F5F-\u1F7D\u1F80-\u1FB4\u1FB6-\u1FBC\u1FBE\u1FC2-\u1FC4\u1FC6-\u1FCC\u1FD0-\u1FD3\u1FD6-\u1FDB\u1FE0-\u1FEC\u1FF2-\u1FF4\u1FF6-\u1FFC\u2071\u207F\u2090-\u209C\u2102\u2107\u210A-\u2113\u2115\u2119-\u211D\u2124\u2126\u2128\u212A-\u212D\u212F-\u2139\u213C-\u213F\u2145-\u2149\u214E\u2183\u2184\u2C00-\u2C2E\u2C30-\u2C5E\u2C60-\u2CE4\u2CEB-\u2CEE\u2CF2\u2CF3\u2D00-\u2D25\u2D27\u2D2D\u2D30-\u2D67\u2D6F\u2D80-\u2D96\u2DA0-\u2DA6\u2DA8-\u2DAE\u2DB0-\u2DB6\u2DB8-\u2DBE\u2DC0-\u2DC6\u2DC8-\u2DCE\u2DD0-\u2DD6\u2DD8-\u2DDE\u2E2F\u3005\u3006\u3031-\u3035\u303B\u303C\u3041-\u3096\u309D-\u309F\u30A1-\u30FA\u30FC-\u30FF\u3105-\u312D\u3131-\u318E\u31A0-\u31BA\u31F0-\u31FF\u3400-\u4DB5\u4E00-\u9FCC\uA000-\uA48C\uA4D0-\uA4FD\uA500-\uA60C\uA610-\uA61F\uA62A\uA62B\uA640-\uA66E\uA67F-\uA697\uA6A0-\uA6E5\uA717-\uA71F\uA722-\uA788\uA78B-\uA78E\uA790-\uA793\uA7A0-\uA7AA\uA7F8-\uA801\uA803-\uA805\uA807-\uA80A\uA80C-\uA822\uA840-\uA873\uA882-\uA8B3\uA8F2-\uA8F7\uA8FB\uA90A-\uA925\uA930-\uA946\uA960-\uA97C\uA984-\uA9B2\uA9CF\uAA00-\uAA28\uAA40-\uAA42\uAA44-\uAA4B\uAA60-\uAA76\uAA7A\uAA80-\uAAAF\uAAB1\uAAB5\uAAB6\uAAB9-\uAABD\uAAC0\uAAC2\uAADB-\uAADD\uAAE0-\uAAEA\uAAF2-\uAAF4\uAB01-\uAB06\uAB09-\uAB0E\uAB11-\uAB16\uAB20-\uAB26\uAB28-\uAB2E\uABC0-\uABE2\uAC00-\uD7A3\uD7B0-\uD7C6\uD7CB-\uD7FB\uF900-\uFA6D\uFA70-\uFAD9\uFB00-\uFB06\uFB13-\uFB17\uFB1D\uFB1F-\uFB28\uFB2A-\uFB36\uFB38-\uFB3C\uFB3E\uFB40\uFB41\uFB43\uFB44\uFB46-\uFBB1\uFBD3-\uFD3D\uFD50-\uFD8F\uFD92-\uFDC7\uFDF0-\uFDFB\uFE70-\uFE74\uFE76-\uFEFC\uFF21-\uFF3A\uFF41-\uFF5A\uFF66-\uFFBE\uFFC2-\uFFC7\uFFCA-\uFFCF\uFFD2-\uFFD7\uFFDA-\uFFDC]/g;

// 2D Canvas drawing primitives.
function jsHasCtx2D(elem) {return !!elem.getContext;}
function jsGetCtx2D(elem) {return elem.getContext('2d');}
function jsBeginPath(ctx) {ctx.beginPath();}
function jsMoveTo(ctx, x, y) {ctx.moveTo(x, y);}
function jsLineTo(ctx, x, y) {ctx.lineTo(x, y);}
function jsStroke(ctx) {ctx.stroke();}
function jsFill(ctx) {ctx.fill();}
function jsRotate(ctx, radians) {ctx.rotate(radians);}
function jsTranslate(ctx, x, y) {ctx.translate(x, y);}
function jsScale(ctx, x, y) {ctx.scale(x, y);}
function jsPushState(ctx) {ctx.save();}
function jsPopState(ctx) {ctx.restore();}
function jsResetCanvas(el) {el.width = el.width;}
function jsDrawImage(ctx, img, x, y) {ctx.drawImage(img, x, y);}
function jsDrawImageClipped(ctx, img, x, y, cx, cy, cw, ch) {
    ctx.drawImage(img, cx, cy, cw, ch, x, y, cw, ch);
}
function jsDrawText(ctx, str, x, y) {ctx.fillText(str, x, y);}
function jsClip(ctx) {ctx.clip();}
function jsArc(ctx, x, y, radius, fromAngle, toAngle) {
    ctx.arc(x, y, radius, fromAngle, toAngle);
}
function jsCanvasToDataURL(el) {return el.toDataURL('image/png');}

// Simulate handles.
// When implementing new handles, remember that passed strings may be thunks,
// and so need to be evaluated before use.

function jsNewHandle(init, read, write, flush, close, seek, tell) {
    var h = {
        read: read || function() {},
        write: write || function() {},
        seek: seek || function() {},
        tell: tell || function() {},
        close: close || function() {},
        flush: flush || function() {}
    };
    init.call(h);
    return h;
}

function jsReadHandle(h, len) {return h.read(len);}
function jsWriteHandle(h, str) {return h.write(str);}
function jsFlushHandle(h) {return h.flush();}
function jsCloseHandle(h) {return h.close();}

function jsMkConWriter(op) {
    return function(str) {
        str = E(str);
        var lines = (this.buf + str).split('\n');
        for(var i = 0; i < lines.length-1; ++i) {
            op.call(console, lines[i]);
        }
        this.buf = lines[lines.length-1];
    }
}

function jsMkStdout() {
    return jsNewHandle(
        function() {this.buf = '';},
        function(_) {return '';},
        jsMkConWriter(console.log),
        function() {console.log(this.buf); this.buf = '';}
    );
}

function jsMkStderr() {
    return jsNewHandle(
        function() {this.buf = '';},
        function(_) {return '';},
        jsMkConWriter(console.warn),
        function() {console.warn(this.buf); this.buf = '';}
    );
}

function jsMkStdin() {
    return jsNewHandle(
        function() {this.buf = '';},
        function(len) {
            while(this.buf.length < len) {
                this.buf += prompt('[stdin]') + '\n';
            }
            var ret = this.buf.substr(0, len);
            this.buf = this.buf.substr(len);
            return ret;
        }
    );
}

var _0=function(_1,_2){while(1){var _3=E(_2);if(!_3[0]){return false;}else{if(!A(_1,[_3[1]])){_2=_3[2];continue;}else{return true;}}}},_4=0,_5=new T(function(){return [0,"change"];}),_6=new T(function(){return [0,"keyup"];}),_7=new T(function(){return [0,"value"];}),_8=function(_9){return E(E(_9)[1]);},_a=function(_b){var _c=E(_b),_d=A(_8,[_c[1],_e]);return E(_d[1])==18445595?E(_d[2])==52003073?[1,_c[2]]:[0]:[0];},_f=unCStr("base"),_g=unCStr("Control.Exception.Base"),_h=unCStr("PatternMatchFail"),_i=[0,18445595,52003073,_f,_g,_h],_j=[0],_k=[0,18445595,52003073,_i,_j],_l=function(_m){return E(_k);},_n=function(_o){return E(E(_o)[1]);},_p=function(_q,_r){var _s=E(_q);return _s[0]==0?E(_r):[1,_s[1],new T(function(){return _p(_s[2],_r);})];},_t=function(_u,_v){return _p(E(_u)[1],_v);},_w=[0,44],_x=[0,93],_y=[0,91],_z=function(_A,_B,_C){var _D=E(_B);return _D[0]==0?unAppCStr("[]",_C):[1,_y,new T(function(){return A(_A,[_D[1],new T(function(){var _E=function(_F){var _G=E(_F);return _G[0]==0?E([1,_x,_C]):[1,_w,new T(function(){return A(_A,[_G[1],new T(function(){return _E(_G[2]);})]);})];};return _E(_D[2]);})]);})];},_H=function(_I,_J){return _z(_t,_I,_J);},_K=function(_L,_M,_N){return _p(E(_M)[1],_N);},_O=[0,_K,_n,_H],_P=new T(function(){return [0,_l,_O,_Q,_a];}),_Q=function(_R){return [0,_P,_R];},_S=unCStr("Non-exhaustive patterns in"),_T=function(_U,_V){return die(new T(function(){return A(_V,[_U]);}));},_W=function(_X,_Y){var _Z=E(_Y);if(!_Z[0]){return [0,_j,_j];}else{var _10=_Z[1];if(!A(_X,[_10])){return [0,_j,_Z];}else{var _11=new T(function(){var _12=_W(_X,_Z[2]);return [0,_12[1],_12[2]];});return [0,[1,_10,new T(function(){return E(E(_11)[1]);})],new T(function(){return E(E(_11)[2]);})];}}},_13=[0,32],_14=[0,10],_15=[1,_14,_j],_16=function(_17){return E(E(_17)[1])==124?false:true;},_18=function(_19,_1a){var _1b=_W(_16,unCStr(_19)),_1c=_1b[1],_1d=function(_1e,_1f){return _p(_1e,function(){return unAppCStr(": ",new T(function(){return _p(_1a,function(){return _p(_1f,_15);});}));});},_1g=E(_1b[2]);return _1g[0]==0?_1d(_1c,_j):E(E(_1g[1])[1])==124?_1d(_1c,[1,_13,_1g[2]]):_1d(_1c,_j);},_1h=function(_1i){return _T([0,new T(function(){return _18(_1i,_S);})],_Q);},_1j=function(_1k){return _1h("calculator.hs:(6,1)-(23,34)|function calculator");},_1l=new T(function(){return _1j(_1m);}),_1n=unCStr("innerHTML"),_1o=function(_1p,_){var _1q=E(_1p);if(!_1q[0]){return E(_1l);}else{var _1r=_1q[1],_1s=E(_1q[2]);if(!_1s[0]){return E(_1l);}else{var _1t=_1s[1],_1u=E(_1s[2]);if(!_1u[0]){return E(_1l);}else{var _1v=_1u[1],_1w=E(_1u[2]);if(!_1w[0]){return E(_1l);}else{if(!E(_1w[2])[0]){var _1x=function(_){var _1y=E(_7)[1],_1z=jsGet(E(_1r)[1],_1y),_1A=_1z,_1B=jsGet(E(_1t)[1],_1y),_1C=_1B,_1D=jsGet(E(_1v)[1],_1y),_1E=_1D,_1F=Number(_1A),_1G=_1F,_1H=isDoubleNaN(_1G),_1I=_1H;if(!E(_1I)){var _1J=Number(_1C),_1K=_1J,_1L=isDoubleNaN(_1K),_1M=_1L;if(!E(_1M)){var _1N=function(_1O){var _1P=jsSet(E(_1w[1])[1],toJSStr(E(_1n)),toJSStr(_1O));return _4;},_1Q=fromJSStr(_1E);if(!_1Q[0]){var _1R=String(0),_1S=_1R;return _1N(fromJSStr(_1S));}else{var _1T=_1Q[2];switch(E(E(_1Q[1])[1])){case 42:if(!E(_1T)[0]){var _1U=String(_1G*_1K),_1V=_1U;return _1N(fromJSStr(_1V));}else{var _1W=String(0),_1X=_1W;return _1N(fromJSStr(_1X));}break;case 43:if(!E(_1T)[0]){var _1Y=String(_1G+_1K),_1Z=_1Y;return _1N(fromJSStr(_1Z));}else{var _20=String(0),_21=_20;return _1N(fromJSStr(_21));}break;case 45:if(!E(_1T)[0]){var _22=String(_1G-_1K),_23=_22;return _1N(fromJSStr(_23));}else{var _24=String(0),_25=_24;return _1N(fromJSStr(_25));}break;case 47:if(!E(_1T)[0]){var _26=String(_1G/_1K),_27=_26;return _1N(fromJSStr(_27));}else{var _28=String(0),_29=_28;return _1N(fromJSStr(_29));}break;default:var _2a=String(0),_2b=_2a;return _1N(fromJSStr(_2b));}}}else{return _4;}}else{return _4;}},_2c=function(_2d,_){return _1x(_);},_2e=E(_6)[1],_2f=jsSetCB(E(_1r)[1],_2e,_2c),_2g=_2f,_2h=jsSetCB(E(_1t)[1],_2e,_2c),_2i=_2h,_2j=jsSetCB(E(_1v)[1],E(_5)[1],_1x),_2k=_2j;return new T(function(){return E(_2k)==0?false:true;});}else{return E(_1l);}}}}}},_2l=unCStr("Maybe.fromJust: Nothing"),_2m=new T(function(){return err(_2l);}),_2n=function(_2o){var _2p=E(_2o);return _2p[0]==0?E(_2m):E(_2p[1]);},_2q=function(_2r){return E(_2r)[0]==0?true:false;},_2s=unCStr("result"),_2t=[1,_2s,_j],_2u=unCStr("op"),_2v=[1,_2u,_2t],_2w=[0,98],_2x=[1,_2w,_j],_2y=[1,_2x,_2v],_2z=function(_2A,_){var _2B=E(_2A);if(!_2B[0]){return _j;}else{var _2C=jsFind(toJSStr(E(_2B[1]))),_2D=_2C,_2E=_2z(_2B[2],_),_2F=_2E;return [1,_2D,_2F];}},_2G=[0,97],_2H=function(_2I,_){var _2J=jsFind(toJSStr([1,_2G,_j])),_2K=_2J,_2L=_2z(_2I,_),_2M=_2L;return [1,_2K,_2M];},_2N=[1,_2G,_j],_2O=[1,_2N,_2y],_2P=function(_2Q,_2R){var _2S=E(_2R);return _2S[0]==0?[0]:[1,new T(function(){return A(_2Q,[_2S[1]]);}),new T(function(){return _2P(_2Q,_2S[2]);})];},_2T=[0,34],_2U=function(_2V,_2W){while(1){var _2X=(function(_2Y,_2Z){var _30=E(_2Y);if(!_30[0]){return [0];}else{var _31=_30[2],_32=E(_2Z);if(!_32[0]){return [0];}else{var _33=_32[2];if(!E(_32[1])[0]){return [1,_30[1],new T(function(){return _2U(_31,_33);})];}else{_2V=_31;_2W=_33;return null;}}}})(_2V,_2W);if(_2X!=null){return _2X;}}},_34=new T(function(){return unAppCStr("[]",_j);}),_35=unCStr("Prelude.(!!): negative index\n"),_36=new T(function(){return err(_35);}),_37=unCStr("Prelude.(!!): index too large\n"),_38=new T(function(){return err(_37);}),_39=function(_3a,_3b){while(1){var _3c=E(_3a);if(!_3c[0]){return E(_38);}else{var _3d=E(_3b);if(!_3d){return E(_3c[1]);}else{_3a=_3c[2];_3b=_3d-1|0;continue;}}}},_3e=function(_3f,_3g){while(1){if(_3f>=10){var _3h=quotRemI(_3f,10);_3f=_3h[1];var _3i=[1,[0,48+_3h[2]|0],_3g];_3g=_3i;continue;}else{return [0,[0,48+_3f|0],_3g];}}},_3j=[0,45],_3k=function(_3l,_3m){if(_3l>=0){return _3e(_3l,_3m);}else{var _3n=E(_3l);return _3n==0?[0,_3j,new T(function(){var _3o=quotRemI(0,10),_3p=_3e( -_3o[1],new T(function(){var _3q=_3e( -_3o[2],_3m);return [1,_3q[1],_3q[2]];}));return [1,_3p[1],_3p[2]];})]:[0,_3j,new T(function(){var _3r=_3e( -_3n,_3m);return [1,_3r[1],_3r[2]];})];}},_3s=unCStr("ACK"),_3t=unCStr("BEL"),_3u=unCStr("BS"),_3v=unCStr("SP"),_3w=[1,_3v,_j],_3x=unCStr("US"),_3y=[1,_3x,_3w],_3z=unCStr("RS"),_3A=[1,_3z,_3y],_3B=unCStr("GS"),_3C=[1,_3B,_3A],_3D=unCStr("FS"),_3E=[1,_3D,_3C],_3F=unCStr("ESC"),_3G=[1,_3F,_3E],_3H=unCStr("SUB"),_3I=[1,_3H,_3G],_3J=unCStr("EM"),_3K=[1,_3J,_3I],_3L=unCStr("CAN"),_3M=[1,_3L,_3K],_3N=unCStr("ETB"),_3O=[1,_3N,_3M],_3P=unCStr("SYN"),_3Q=[1,_3P,_3O],_3R=unCStr("NAK"),_3S=[1,_3R,_3Q],_3T=unCStr("DC4"),_3U=[1,_3T,_3S],_3V=unCStr("DC3"),_3W=[1,_3V,_3U],_3X=unCStr("DC2"),_3Y=[1,_3X,_3W],_3Z=unCStr("DC1"),_40=[1,_3Z,_3Y],_41=unCStr("DLE"),_42=[1,_41,_40],_43=unCStr("SI"),_44=[1,_43,_42],_45=unCStr("SO"),_46=[1,_45,_44],_47=unCStr("CR"),_48=[1,_47,_46],_49=unCStr("FF"),_4a=[1,_49,_48],_4b=unCStr("VT"),_4c=[1,_4b,_4a],_4d=unCStr("LF"),_4e=[1,_4d,_4c],_4f=unCStr("HT"),_4g=[1,_4f,_4e],_4h=[1,_3u,_4g],_4i=[1,_3t,_4h],_4j=[1,_3s,_4i],_4k=unCStr("ENQ"),_4l=[1,_4k,_4j],_4m=unCStr("EOT"),_4n=[1,_4m,_4l],_4o=unCStr("ETX"),_4p=[1,_4o,_4n],_4q=unCStr("STX"),_4r=[1,_4q,_4p],_4s=unCStr("SOH"),_4t=[1,_4s,_4r],_4u=unCStr("NUL"),_4v=[1,_4u,_4t],_4w=[0,92],_4x=unCStr("\\DEL"),_4y=unCStr("\\a"),_4z=unCStr("\\\\"),_4A=unCStr("\\SO"),_4B=unCStr("\\r"),_4C=unCStr("\\f"),_4D=unCStr("\\v"),_4E=unCStr("\\n"),_4F=unCStr("\\t"),_4G=unCStr("\\b"),_4H=function(_4I,_4J){if(_4I<=127){var _4K=E(_4I);switch(_4K){case 92:return _p(_4z,_4J);case 127:return _p(_4x,_4J);default:if(_4K<32){var _4L=E(_4K);switch(_4L){case 7:return _p(_4y,_4J);case 8:return _p(_4G,_4J);case 9:return _p(_4F,_4J);case 10:return _p(_4E,_4J);case 11:return _p(_4D,_4J);case 12:return _p(_4C,_4J);case 13:return _p(_4B,_4J);case 14:return _p(_4A,function(){var _4M=E(_4J);return _4M[0]==0?[0]:E(E(_4M[1])[1])==72?unAppCStr("\\&",_4M):E(_4M);});default:return _p([1,_4w,new T(function(){var _4N=_4L;return _4N>=0?_39(_4v,_4N):E(_36);})],_4J);}}else{return [1,[0,_4K],_4J];}}}else{return [1,_4w,new T(function(){var _4O=_3k(_4I,new T(function(){var _4P=E(_4J);if(!_4P[0]){return [0];}else{var _4Q=E(_4P[1])[1];return _4Q<48?E(_4P):_4Q>57?E(_4P):unAppCStr("\\&",_4P);}}));return [1,_4O[1],_4O[2]];})];}},_4R=unCStr("\\\""),_4S=function(_4T,_4U){var _4V=E(_4T);if(!_4V[0]){return E(_4U);}else{var _4W=_4V[2],_4X=E(E(_4V[1])[1]);return _4X==34?_p(_4R,function(){return _4S(_4W,_4U);}):_4H(_4X,new T(function(){return _4S(_4W,_4U);}));}},_4Y=[1,_x,_j],_4Z=function(_50){var _51=E(_50);return _51[0]==0?E(_4Y):[1,_w,[1,_2T,new T(function(){return _4S(_51[1],[1,_2T,new T(function(){return _4Z(_51[2]);})]);})]];},_52=function(_53,_54){return err(unAppCStr("Elements with the following IDs could not be found: ",new T(function(){var _55=_2U(_54,_53);return _55[0]==0?E(_34):[1,_y,[1,_2T,new T(function(){return _4S(_55[1],[1,_2T,new T(function(){return _4Z(_55[2]);})]);})]];})));},_56=function(_){var _57=_2H(_2y,_),_58=_57;return !_0(_2q,_58)?_1o(_2P(_2n,_58),_):_52(_58,_2O);},_59=unCStr("If you can read this, shutdownHaskellAndExit did not exit."),_5a=function(_5b){var _5c=E(_5b),_5d=A(_8,[_5c[1],_e]);return E(_5d[1])==4053623282?E(_5d[2])==3693590983?[1,_5c[2]]:[0]:[0];},_5e=unCStr("base"),_5f=unCStr("GHC.IO.Exception"),_5g=unCStr("IOException"),_5h=[0,4053623282,3693590983,_5e,_5f,_5g],_5i=[0,4053623282,3693590983,_5h,_j],_5j=function(_5k){return E(_5i);},_5l=unCStr(": "),_5m=[0,41],_5n=unCStr(" ("),_5o=unCStr("already exists"),_5p=unCStr("does not exist"),_5q=unCStr("protocol error"),_5r=unCStr("failed"),_5s=unCStr("invalid argument"),_5t=unCStr("inappropriate type"),_5u=unCStr("hardware fault"),_5v=unCStr("unsupported operation"),_5w=unCStr("timeout"),_5x=unCStr("resource vanished"),_5y=unCStr("interrupted"),_5z=unCStr("resource busy"),_5A=unCStr("resource exhausted"),_5B=unCStr("end of file"),_5C=unCStr("illegal operation"),_5D=unCStr("permission denied"),_5E=unCStr("user error"),_5F=unCStr("unsatisified constraints"),_5G=unCStr("system error"),_5H=function(_5I,_5J){switch(E(_5I)){case 0:return _p(_5o,_5J);case 1:return _p(_5p,_5J);case 2:return _p(_5z,_5J);case 3:return _p(_5A,_5J);case 4:return _p(_5B,_5J);case 5:return _p(_5C,_5J);case 6:return _p(_5D,_5J);case 7:return _p(_5E,_5J);case 8:return _p(_5F,_5J);case 9:return _p(_5G,_5J);case 10:return _p(_5q,_5J);case 11:return _p(_5r,_5J);case 12:return _p(_5s,_5J);case 13:return _p(_5t,_5J);case 14:return _p(_5u,_5J);case 15:return _p(_5v,_5J);case 16:return _p(_5w,_5J);case 17:return _p(_5x,_5J);default:return _p(_5y,_5J);}},_5K=[0,125],_5L=unCStr("{handle: "),_5M=function(_5N,_5O,_5P,_5Q,_5R,_5S){var _5T=function(){var _5U=function(){return _5H(_5O,function(){var _5V=E(_5Q);return _5V[0]==0?E(_5S):_p(_5n,function(){return _p(_5V,[1,_5m,_5S]);});});},_5W=E(_5P);return _5W[0]==0?E(_5U):_p(_5W,function(){return _p(_5l,_5U);});},_5X=E(_5R);if(!_5X[0]){var _5Y=E(_5N);if(!_5Y[0]){return E(_5T);}else{var _5Z=E(_5Y[1]);return _5Z[0]==0?_p(_5L,function(){return _p(_5Z[1],[1,_5K,new T(function(){return _p(_5l,_5T);})]);}):_p(_5L,function(){return _p(_5Z[1],[1,_5K,new T(function(){return _p(_5l,_5T);})]);});}}else{return _p(_5X[1],function(){return _p(_5l,_5T);});}},_60=function(_61){var _62=E(_61);return _5M(_62[1],_62[2],_62[3],_62[4],_62[6],_j);},_63=function(_64,_65){var _66=E(_64);return _5M(_66[1],_66[2],_66[3],_66[4],_66[6],_65);},_67=function(_68,_69){return _z(_63,_68,_69);},_6a=function(_6b,_6c,_6d){var _6e=E(_6c);return _5M(_6e[1],_6e[2],_6e[3],_6e[4],_6e[6],_6d);},_6f=[0,_6a,_60,_67],_6g=new T(function(){return [0,_5j,_6f,_6h,_5a];}),_6h=function(_6i){return [0,_6g,_6i];},_6j=[0],_6k=7,_6l=function(_6m){return [0,_6j,_6k,_j,_6m,_6j,_6j];},_6n=function(_6o,_){return die(new T(function(){return _6h(new T(function(){return _6l(_6o);}));}));},_6p=function(_6q,_){return _6n(_6q,_);},_6r=function(_6s,_6t,_){if(_6t<0){if(_6t<(-127)){var _6u=shutdownHaskellAndExit(255,_6s);return _6p(_59,_);}else{if(_6t>(-1)){var _6v=shutdownHaskellAndExit(255,_6s);return _6p(_59,_);}else{var _6w=shutdownHaskellAndSignal( -_6t&4294967295,_6s);return _6p(_59,_);}}}else{if(_6t>255){if(_6t<(-127)){var _6x=shutdownHaskellAndExit(255,_6s);return _6p(_59,_);}else{if(_6t>(-1)){var _6y=shutdownHaskellAndExit(255,_6s);return _6p(_59,_);}else{var _6z=shutdownHaskellAndSignal( -_6t&4294967295,_6s);return _6p(_59,_);}}}else{var _6A=shutdownHaskellAndExit(_6t&4294967295,_6s);return _6p(_59,_);}}},_6B=function(_6C,_){return _6r(0,E(_6C)[1],_);},_6D=function(_6E){var _6F=E(_6E),_6G=A(_8,[_6F[1],_e]);if(E(_6G[1])==2677205718){if(E(_6G[2])==3454527707){var _6H=E(_6F[2]),_6I=A(_8,[_6H[1],_e]);return E(_6I[1])==2363394409?E(_6I[2])==2156861182?[1,_6H[2]]:[0]:[0];}else{return [0];}}else{return [0];}},_6J=function(_6K){return E(E(_6K)[5]);},_6L=function(_6M,_){var _6N=E(_6M),_6O=_6N[6],_6P=rMV(_6O),_6Q=_6P;if(!E(E(_6Q)[3])){return _4;}else{var _6R=rMV(_6O),_6S=_6R,_6T=E(_6S);if(_6T[5]!=_6T[6]){var _6U=A(_6J,[_6N[2],_6N[4],_6T,_]),_6V=_6U,_=wMV(_6O,_6V);return _4;}else{return _4;}}},_6W=unCStr("hFlush"),_6X=2,_6Y=function(_6Z,_70,_71,_72,_){var _73=(function(_74,_75,_){while(1){var _76=A(_6Z,[_74,_75,_]),_77=_76,_78=E(_77),_79=_78[3];if(E(_78[1])==2){var _7a=E(_78[2]);if(E(_74)[5]!=_7a[5]){return [0,_6X,_7a,_79];}else{var _7b=A(_70,[_7a,_79,_]),_7c=_7b,_7d=E(_7c);_74=_7d[1];_75=_7d[2];continue;}}else{return E(_76);}}})(_71,_72,_),_7e=_73;return new T(function(){var _7f=E(_7e);return [0,_7f[2],_7f[3]];});},_7g=1,_7h=1,_7i=function(_7j){return E(E(_7j)[4]);},_7k=5,_7l=unCStr("cannot flush the read buffer: underlying device is not seekable"),_7m=[0,_6j,_7k,_j,_7l,_6j,_6j],_7n=function(_7o,_){return die(new T(function(){return _6h(_7o);}));},_7p=function(_7q,_){return _7n(_7q,_);},_7r=function(_7s){return E(E(_7s)[4]);},_7t=unCStr("handle is not open for writing"),_7u=[0,_6j,_7k,_j,_7t,_6j,_6j],_7v=function(_7w){return E(E(_7w)[5]);},_7x=function(_7y){return [0,_7y];},_7z=unCStr("handle is closed"),_7A=[0,_6j,_7k,_j,_7z,_6j,_6j],_7B=function(_7C,_7D,_7E){var _7F=E(_7C);return [0,[1,_7E],_7F[2],_7D,_7F[4],_7F[5],new T(function(){var _7G=E(_7F[6]);if(!_7G[0]){var _7H=E(_7E);return _7H[0]==0?[1,_7H[1]]:[1,_7H[1]];}else{return E(_7G);}})];},_7I=function(_7q,_){return _7n(_7q,_);},_7J=function(_7K,_7L,_7M,_7N,_){var _7O=takeMVar(_7N),_7P=_7O;return jsCatch(new T(function(){return A(_7M,[_7P]);}),function(_7Q,_){var _=putMVar(_7N,_7P),_7R=E(_7Q),_7S=A(_8,[_7R[1],_e]),_7T=_7S[1],_7U=_7S[2],_7V=function(_7W){if(E(_7T)==2677205718){if(E(_7U)==3454527707){var _7X=die("Unsupported PrimOp: myThreadId#"),_7Y=_7X,_=die("Unsupported PrimOp: killThread#");return _7J(_7K,_7L,_7M,_7N,_);}else{return die(_7R);}}else{return die(_7R);}};return E(_7T)==4053623282?E(_7U)==3693590983?_7I(_7B(_7R[2],_7K,_7L),_):_7V(_1m):_7V(_1m);});},_7Z=function(_80,_81,_82,_83,_){var _84=0,_85=_84,_86=function(_){var _87=E(_82)[1],_88=_7J(_80,_81,_83,_87,_),_89=_88,_8a=E(_89),_=putMVar(_87,_8a[1]);return _8a[2];};return E(_85)==0?_86():_86(_);},_8b=function(_8c,_8d,_8e,_8f,_){return _7Z(_8c,_8d,_8e,function(_8g,_){var _8h=E(_8g),_8i=_8h[1],_8j=_8h[4],_8k=_8h[6],_8l=_8h[9];switch(E(_8h[5])){case 0:return _7p(_7A,_);case 1:return _7p(_7A,_);case 2:return _7p(_7u,_);case 5:var _8m=rMV(_8l),_8n=_8m;if(!E(E(_8n)[3])){var _8o=rMV(_8l),_8p=_8o,_8q=E(_8p),_8r=function(_){var _8s=rMV(_8k),_8t=_8s,_8u=E(_8t),_8v=_8u[5],_8w=_8u[6],_8x=function(_,_8y){var _8z=rMV(_8l),_8A=_8z,_=wMV(_8l,new T(function(){var _8B=E(_8A);return [0,_8B[1],_8B[2],_7h,_8B[4],_8B[5],_8B[6]];})),_8C=rMV(_8k),_8D=_8C,_8E=A(_7i,[_8h[2],_8j,_8D,_]),_8F=_8E,_=wMV(_8k,_8F),_8G=A(_8f,[_8h,_]),_8H=_8G;return [0,_8h,_8H];};if(_8v!=_8w){var _8I=A(_7r,[_8i,_8j,_]),_8J=_8I;if(!E(_8J)){return _7p(_7m,_);}else{var _8K=A(_7v,[_8i,_8j,_7g,new T(function(){return _7x( -(_8w-_8v|0));}),_]),_8L=_8K,_=wMV(_8k,[0,_8u[1],_8u[2],_8u[3],_8u[4],0,0]);return _8x(_,_4);}}else{return _8x(_,_4);}};if(!E(_8q[3])){if(_8q[5]!=_8q[6]){var _8M=rMV(_8h[8]),_8N=_8M,_8O=E(_8N),_8P=_8O[2],_8Q=rMV(_8l),_8R=_8Q,_=wMV(_8l,new T(function(){var _8S=E(_8R);return [0,_8S[1],_8S[2],_8S[3],_8S[4],0,0];})),_8T=E(_8R),_8U=E(_8T[5]);if(!_8U){var _=wMV(_8k,_8P);return _8r(_);}else{var _8V=E(_8h[12]);if(!_8V[0]){var _=wMV(_8k,new T(function(){var _8W=E(_8P);return [0,_8W[1],_8W[2],_8W[3],_8W[4],_8W[5]+_8U|0,_8W[6]];}));return _8r(_);}else{var _8X=E(_8V[1]),_8Y=A(_8X[5],[_8O[1],_]),_8Z=_8Y,_90=_6Y(_8X[1],_8X[2],_8P,[0,_8T[1],_8T[2],_8T[3],_8U,0,0],_),_91=_90,_=wMV(_8k,E(_91)[1]);return _8r(_);}}}else{return _8r(_);}}else{return _8r(_);}}else{var _92=A(_8f,[_8h,_]),_93=_92;return [0,_8h,_93];}break;default:var _94=A(_8f,[_8h,_]),_95=_94;return [0,_8h,_95];}},_);},_96=function(_97,_98,_99,_){var _9a=E(_98);return _9a[0]==0?_8b(_97,_9a,[0,_9a[2]],_99,_):_8b(_97,_9a,[0,_9a[3]],_99,_);},_9b=function(_9c,_){return _96(_6W,_9c,_6L,_);},_9d=[0,0],_9e=[0,0],_9f=[0,-1],_9g=function(_){return _9f;},_9h=function(_9i,_9j,_){var _=writeOffAddr("w32",4,E(_9i)[1],0,E(_9j)[1]);return _4;},_9k=function(_9l,_){var _9m=readOffAddr("w32",4,E(_9l)[1],0),_9n=_9m;return [0,_9n];},_9o=function(_9p,_9q,_9r,_){var _=writeOffAddr("w32",4,plusAddr(E(_9p)[1],E(_9q)[1]),0,E(_9r)[1]);return _4;},_9s=function(_9t,_9u,_){var _9v=readOffAddr("w32",4,plusAddr(E(_9t)[1],E(_9u)[1]),0),_9w=_9v;return [0,_9w];},_9x=[0,4],_9y=function(_9z){return E(_9x);},_9A=function(_9B,_9C,_){var _9D=readOffAddr("w32",4,E(_9B)[1],E(_9C)[1]),_9E=_9D;return [0,_9E];},_9F=function(_9G,_9H,_9I,_){var _=writeOffAddr("w32",4,E(_9G)[1],E(_9H)[1],E(_9I)[1]);return _4;},_9J=[0,_9y,_9y,_9A,_9F,_9s,_9o,_9k,_9h],_9K=[0,0],_9L=function(_9M){return E(E(_9M)[3]);},_9N=function(_9O,_9P,_9Q,_){if(_9P>0){var _9R=new T(function(){return A(_9L,[_9O,_9Q,_9K]);}),_9S=new T(function(){return _9L(_9O);});return (function(_9T,_9U,_){while(1){var _9V=E(_9T);if(!_9V){var _9W=A(_9R,[_]),_9X=_9W;return [1,_9X,_9U];}else{var _9Y=A(_9S,[_9Q,[0,_9V],_]),_9Z=_9Y;_9T=_9V-1|0;var _a0=[1,_9Z,_9U];_9U=_a0;continue;}}})(_9P-1|0,_j,_);}else{return _j;}},_a1=[0],_a2=0,_a3=function(_a4,_a5,_a6,_){var _a7=0,_a8=_a7;switch(E(_a8)){case 0:return (function(_){var _a9=A(_a4,[_]),_aa=_a9,_ab=new T(function(){return A(_a6,[_aa]);}),_ac=jsCatch(function(_){return _ab();},function(_ad,_){var _ae=A(_a5,[_aa,_]),_af=_ae;return die(_ad);}),_ag=_ac,_ah=A(_a5,[_aa,_]),_ai=_ah;return _ag;})();case 1:var _aj=A(_a4,[_]),_ak=_aj,_al=jsCatch(new T(function(){return A(_a6,[_ak]);}),function(_am,_){var _an=A(_a5,[_ak,_]),_ao=_an;return die(_am);}),_ap=_al,_aq=A(_a5,[_ak,_]),_ar=_aq;return _ap;default:var _as=A(_a4,[_]),_at=_as,_au=jsCatch(new T(function(){return A(_a6,[_at]);}),function(_av,_){var _aw=A(_a5,[_at,_]),_ax=_aw;return die(_av);}),_ay=_au,_az=A(_a5,[_at,_]),_aA=_az;return _ay;}},_aB=function(_aC){return E(E(_aC)[3]);},_aD=unCStr("mallocForeignPtrBytes: size must be >= 0"),_aE=new T(function(){return err(_aD);}),_aF=function(_aG,_aH,_){var _aI=(function(_aJ,_){while(1){var _aK=readOffAddr("i8",1,_aH,_aJ),_aL=_aK;if(!E(_aL)){return [0,_aJ];}else{var _aM=_aJ+1|0;_aJ=_aM;continue;}}})(0,_),_aN=_aI;return _a3(E(_aG)[2],_aB,function(_aO,_){var _aP=nMV(_a1),_aQ=_aP,_aR=E(_aN)[1],_aS=function(_aT){var _aU=imul(_aT,4)|0;if(_aU>=0){var _aV=nMV(_a1),_aW=_aV,_aX=newByteArr(_aU),_aY=_aX,_aZ=function(_b0,_){var _b1=E(_aO),_b2=A(_b1[1],[_b0,[0,_aY,[1,_aY,_aW],_7h,_aT,0,0],_]),_b3=_b2,_b4=E(_b3),_b5=_b4[3],_b6=E(_b4[2]);if(_b6[5]!=_b6[6]){if(E(_b4[1])==1){var _b7=E(_b5),_b8=_b7[2],_b9=_9N(_9J,_b7[6]-_b7[5]|0,[0,_b7[1]],_),_ba=_b9,_=0,_bb=_aZ(_b6,_),_bc=_bb;return new T(function(){return _p(_ba,_bc);});}else{var _bd=A(_b1[2],[_b6,_b5,_]),_be=_bd,_bf=E(_be),_bg=E(_bf[2]),_bh=_bg[2],_bi=_9N(_9J,_bg[6]-_bg[5]|0,[0,_bg[1]],_),_bj=_bi,_=0,_bk=_aZ(_bf[1],_),_bl=_bk;return new T(function(){return _p(_bj,_bl);});}}else{var _bm=E(_b5),_bn=_bm[2],_bo=_9N(_9J,_bm[6]-_bm[5]|0,[0,_bm[1]],_),_bp=_bo,_=0;return _bp;}};return _aZ([0,_aH,[0,_aQ],_a2,_aR,0,_aR],_);}else{return E(_aE);}};return _aR>1?_aS(_aR):_aS(1);},_);},_bq=1,_br=function(_bs,_bt){while(1){var _bu=E(_bs);if(!_bu[0]){return E(_bt)[0]==0?true:false;}else{var _bv=E(_bt);if(!_bv[0]){return false;}else{if(E(_bu[1])[1]!=E(_bv[1])[1]){return false;}else{_bs=_bu[2];_bt=_bv[2];continue;}}}}},_bw=unCStr("UTF16LE"),_bx=unCStr("UTF16BE"),_by=unCStr("UTF16"),_bz=unCStr("UTF8"),_bA=unCStr("UTF32LE"),_bB=unCStr("UTF32BE"),_bC=unCStr("UTF32"),_bD=[0,41],_bE=[0,40],_bF=function(_bG,_bH,_bI){return _bH>=0?_3k(_bH,_bI):_bG<=6?_3k(_bH,_bI):[0,_bE,new T(function(){var _bJ=_3k(_bH,[1,_bD,_bI]);return [1,_bJ[1],_bJ[2]];})];},_bK=function(_bL){return err(unAppCStr("Prelude.chr: bad argument: ",new T(function(){var _bM=_bF(9,_bL,_j);return [1,_bM[1],_bM[2]];})));},_bN=function(_bO){while(1){var _bP=(function(_bQ){var _bR=E(_bQ);if(!_bR[0]){return [0];}else{var _bS=_bR[2],_bT=E(E(_bR[1])[1]);if(_bT==45){_bO=_bS;return null;}else{return [1,new T(function(){var _bU=u_towupper(_bT&4294967295),_bV=_bU,_bW=_bV&4294967295;return _bW>>>0>1114111?_bK(_bW):[0,_bW];}),new T(function(){return _bN(_bS);})];}}})(_bO);if(_bP!=null){return _bP;}}},_bX=unCStr("UTF-32LE"),_bY=0,_bZ=1,_c0=[0,0],_c1=unCStr("iconvRecoder"),_c2=[0,-1],_c3=function(_c4,_c5,_c6,_c7,_c8,_c9,_ca,_cb,_cc,_cd,_ce,_cf,_cg,_ch,_ci,_){var _cj=newByteArr(8),_ck=_cj,_cl=_ck,_cm=_cl,_cn=E(_cb)[1],_co=function(_cp){var _cq=plusAddr(_c5,_cp),_=die("Unsupported PrimOp: writeAddrOffAddr#"),_cr=newByteArr(8),_cs=_cr,_ct=_cs,_cu=_ct,_cv=E(_ci)[1],_cw=function(_cx){var _cy=plusAddr(_cc,_cx),_=die("Unsupported PrimOp: writeAddrOffAddr#"),_cz=newByteArr(8),_cA=_cz,_cB=_cA,_cC=_cB,_cD=function(_cE){var _=die("Unsupported PrimOp: writeWord64OffAddr#"),_cF=newByteArr(8),_cG=_cF,_cH=_cG,_cI=_cH,_cJ=function(_cK){var _=die("Unsupported PrimOp: writeWord64OffAddr#"),_cL=hs_iconv(E(_c4)[1],_cm,_cC,_cu,_cI),_cM=_cL,_cN=die("Unsupported PrimOp: readWord64OffAddr#"),_cO=_cN,_cP=die("Unsupported PrimOp: readWord64OffAddr#"),_cQ=_cP,_cR=new T(function(){return _cv<64?[0,(_cQ&4294967295)>>_cv]:(_cQ&4294967295)>=0?E(_c0):E(_c2);}),_cS=new T(function(){var _cT=E(_cO);return _cT==0?[0,_c5,_c6,_c7,_c8,0,0]:_cn<64?[0,_c5,_c6,_c7,_c8,_ca-((_cT&4294967295)>>_cn)|0,_ca]:(_cT&4294967295)>=0?[0,_c5,_c6,_c7,_c8,_ca,_ca]:[0,_c5,_c6,_c7,_c8,_ca+1|0,_ca];});if(E(_cM)==4294967295){var _cU=__hscore_get_errno(),_cV=_cU;switch(_cV&4294967295){case 7:var _=0,_=0,_=0,_=0,_=0,_=0;return [0,_bZ,_cS,new T(function(){return [0,_cc,_cd,_ce,_cf,_cg,_cf-E(_cR)[1]|0];})];case 22:var _=0,_=0,_=0,_=0,_=0,_=0;return [0,_bY,_cS,new T(function(){return [0,_cc,_cd,_ce,_cf,_cg,_cf-E(_cR)[1]|0];})];case 92:var _=0,_=0,_=0,_=0,_=0,_=0;return [0,new T(function(){return E(E(_cR)[1])==0?1:2;}),_cS,new T(function(){return [0,_cc,_cd,_ce,_cf,_cg,_cf-E(_cR)[1]|0];})];default:var _cW=__hscore_get_errno(),_cX=_cW;return _7I(_cY(_c1,[0,_cX&4294967295],_6j,_6j),_);}}else{var _=0,_=0,_=0,_=0,_=0,_=0;return [0,_bY,_cS,new T(function(){return [0,_cc,_cd,_ce,_cf,_cg,_cf-E(_cR)[1]|0];})];}};return _cv<64?_cJ((_cf-_ch|0)<<_cv>>>0):_cJ(0);};return _cn<64?_cD((_ca-_c9|0)<<_cn>>>0):_cD(0);};return _cv<64?_cw(_ch<<_cv):_cw(0);};return _cn<64?_co(_c9<<_cn):_co(0);},_cZ=[0,2],_d0=function(_d1,_d2,_d3,_){var _d4=E(_d2),_d5=E(_d3);return _c3(_d1,_d4[1],_d4[2],_d4[3],_d4[4],_d4[5],_d4[6],_cZ,_d5[1],_d5[2],_d5[3],_d5[4],_d5[5],_d5[6],_c0,_);},_d6=function(_d7,_d8,_d9,_){var _da=E(_d8),_db=E(_d9);return _c3(_d7,_da[1],_da[2],_da[3],_da[4],_da[5],_da[6],_c0,_db[1],_db[2],_db[3],_db[4],_db[5],_db[6],_cZ,_);},_dc=function(_dd){return E(E(_dd)[1])==47?false:true;},_de=function(_df,_){return _4;},_dg=function(_){return _4;},_dh=unCStr("mkTextEncoding"),_di=unCStr("Iconv.close"),_dj=function(_dk,_dl){while(1){var _dm=E(_dk);if(!_dm[0]){return E(_dl);}else{_dk=_dm[2];var _dn=_dl+1|0;_dl=_dn;continue;}}},_do=function(_dp,_dq,_){var _dr=newByteArr(_dj(_dp,0)+1|0),_ds=_dr,_dt=_ds,_du=_dt,_dv=_du,_dw=(function(_dx,_dy,_){while(1){var _dz=E(_dx);if(!_dz[0]){var _=writeOffAddr("i8",1,_dv,_dy,0);return _4;}else{var _=writeOffAddr("i8",1,_dv,_dy,E(_dz[1])[1]&255);_dx=_dz[2];var _dA=_dy+1|0;_dy=_dA;continue;}}})(_dp,0,_),_dB=_dw,_dC=A(_dq,[[0,_dv],_]),_dD=_dC,_=0;return _dD;},_dE=function(_dF,_dG,_){return _do(_dF,_dG,_);},_dH=function(_dI,_dJ,_dK,_dL){return _dE(_dI,function(_dM){return _dE(_dJ,function(_dN,_){var _dO=hs_iconv_open(E(_dN)[1],E(_dM)[1]),_dP=_dO,_dQ=E(_dP);if(_dQ==(-1)){var _dR=__hscore_get_errno(),_dS=_dR;return _7I(_cY(_dh,[0,_dS&4294967295],_6j,_6j),_);}else{return [0,new T(function(){return A(_dL,[[0,_dQ]]);}),_dK,function(_){var _dT=hs_iconv_close(_dQ),_dU=_dT;if((_dU&4294967295)==(-1)){var _dV=__hscore_get_errno(),_dW=_dV;return _7I(_cY(_di,[0,_dW&4294967295],_6j,_6j),_);}else{return _4;}},_dg,_de];}});});},_dX=12,_dY=unCStr("invalid byte sequence"),_dZ=unCStr("recoverDecode"),_e0=[0,_6j,_dX,_dZ,_dY,_6j,_6j],_e1=function(_e2,_e3,_e4,_e5,_e6,_e7,_e8,_e9,_ea,_eb,_ec,_ed,_ee,_){switch(E(_e2)){case 0:return _7p(_e0,_);case 1:return [0,[0,_e3,_e4,_e5,_e6,_e7+1|0,_e8],[0,_e9,_ea,_eb,_ec,_ed,_ee]];case 2:var _=writeOffAddr("w32",4,_e9,_ee,65533),_=0;return [0,[0,_e3,_e4,_e5,_e6,_e7+1|0,_e8],[0,_e9,_ea,_eb,_ec,_ed,_ee+1|0]];default:var _ef=readOffAddr("w8",1,plusAddr(_e3,_e7),0),_eg=_ef,_=0;if(_eg>=128){var _eh=56320+(_eg&4294967295)|0;if(_eh>>>0>1114111){return _bK(_eh);}else{var _=writeOffAddr("w32",4,_e9,_ee,_eh),_=0;return [0,[0,_e3,_e4,_e5,_e6,_e7+1|0,_e8],[0,_e9,_ea,_eb,_ec,_ed,_ee+1|0]];}}else{var _ei=_eg&4294967295;if(_ei>>>0>1114111){return _bK(_ei);}else{var _=writeOffAddr("w32",4,_e9,_ee,_ei),_=0;return [0,[0,_e3,_e4,_e5,_e6,_e7+1|0,_e8],[0,_e9,_ea,_eb,_ec,_ed,_ee+1|0]];}}}},_ej=function(_ek,_el,_em,_){var _en=E(_el),_eo=E(_em);return _e1(_ek,_en[1],_en[2],_en[3],_en[4],_en[5],_en[6],_eo[1],_eo[2],_eo[3],_eo[4],_eo[5],_eo[6],_);},_ep=unCStr("recoverEncode"),_eq=unCStr("invalid character"),_er=[0,_6j,_dX,_ep,_eq,_6j,_6j],_es=function(_){return _7p(_er,_);},_et=function(_eu,_ev,_ew,_ex,_ey,_ez,_eA,_eB,_eC,_eD,_eE,_eF,_eG,_){var _eH=readOffAddr("w32",4,_ev,_ez),_eI=_eH,_=0;switch(E(_eu)){case 0:return _es(_);case 1:return [0,[0,_ev,_ew,_ex,_ey,_ez+1|0,_eA],[0,_eB,_eC,_eD,_eE,_eF,_eG]];case 2:if(E(_eI)==63){return [0,[0,_ev,_ew,_ex,_ey,_ez+1|0,_eA],[0,_eB,_eC,_eD,_eE,_eF,_eG]];}else{var _=writeOffAddr("w32",4,_ev,_ez,63),_=0;return [0,[0,_ev,_ew,_ex,_ey,_ez,_eA],[0,_eB,_eC,_eD,_eE,_eF,_eG]];}break;default:var _eJ=_eI;if(56448>_eJ){return _es(_);}else{if(_eJ>=56576){return _es(_);}else{var _=writeOffAddr("w8",1,plusAddr(_eB,_eG),0,_eJ>>>0&255),_=0;return [0,[0,_ev,_ew,_ex,_ey,_ez+1|0,_eA],[0,_eB,_eC,_eD,_eE,_eF,_eG+1|0]];}}}},_eK=function(_eL,_eM,_eN,_){var _eO=E(_eM),_eP=E(_eN);return _et(_eL,_eO[1],_eO[2],_eO[3],_eO[4],_eO[5],_eO[6],_eP[1],_eP[2],_eP[3],_eP[4],_eP[5],_eP[6],_);},_eQ=function(_eR,_eS,_){return [0,_eS,new T(function(){var _eT=new T(function(){var _eU=_W(_dc,_eS);return [0,_eU[1],_eU[2]];});return _dH(new T(function(){return E(E(_eT)[1]);}),new T(function(){return _p(_bX,function(){return E(E(_eT)[2]);});}),function(_eV,_eW,_){return _ej(_eR,_eV,_eW,_);},_d6);}),new T(function(){return _dH(_bX,_eS,function(_eV,_eW,_){return _eK(_eR,_eV,_eW,_);},_d0);})];},_eX=function(_eY,_eZ,_f0,_f1,_f2,_f3,_f4,_f5,_f6,_f7,_f8,_f9,_){var _fa=[0,_eY,_eZ,_f0,_f1,0,0],_fb=function(_fc,_fd,_){while(1){var _fe=(function(_ff,_fg,_){if(_ff<_f3){if((_f7-_fg|0)>=2){var _fh=readOffAddr("w32",4,_eY,_ff),_fi=_fh,_=0,_fj=_fi;if(_fj>=65536){if((_f7-_fg|0)>=4){var _fk=_fj-65536|0,_=writeOffAddr("w8",1,plusAddr(_f4,_fg),0,((_fk>>18)+216|0)>>>0&255),_=0,_=writeOffAddr("w8",1,plusAddr(_f4,_fg+1|0),0,_fk>>10>>>0&255),_=0,_fl=die("Unsupported PrimOp: andI#"),_=writeOffAddr("w8",1,plusAddr(_f4,_fg+2|0),0,((_fl>>8)+220|0)>>>0&255),_=0,_=writeOffAddr("w8",1,plusAddr(_f4,_fg+3|0),0,_fl>>>0&255),_=0,_fm=_ff+1|0,_fn=_fg+4|0;_fc=_fm;_fd=_fn;return null;}else{return [0,_bZ,new T(function(){return _ff!=_f3?[0,_eY,_eZ,_f0,_f1,_ff,_f3]:E(_fa);}),[0,_f4,_f5,_f6,_f7,_f8,_fg]];}}else{var _fo=function(_fp){if(56320>_fj){var _=writeOffAddr("w8",1,plusAddr(_f4,_fg),0,_fj>>8>>>0&255),_=0,_=writeOffAddr("w8",1,plusAddr(_f4,_fg+1|0),0,_fj>>>0&255),_=0;return _fb(_ff+1|0,_fg+2|0,_);}else{if(_fj>57343){var _=writeOffAddr("w8",1,plusAddr(_f4,_fg),0,_fj>>8>>>0&255),_=0,_=writeOffAddr("w8",1,plusAddr(_f4,_fg+1|0),0,_fj>>>0&255),_=0;return _fb(_ff+1|0,_fg+2|0,_);}else{return [0,_6X,new T(function(){return _ff!=_f3?[0,_eY,_eZ,_f0,_f1,_ff,_f3]:E(_fa);}),[0,_f4,_f5,_f6,_f7,_f8,_fg]];}}};return 55296>_fj?_fo(_1m):_fj>56319?_fo(_1m):[0,_6X,new T(function(){return _ff!=_f3?[0,_eY,_eZ,_f0,_f1,_ff,_f3]:E(_fa);}),[0,_f4,_f5,_f6,_f7,_f8,_fg]];}}else{return [0,_bZ,new T(function(){return _ff!=_f3?[0,_eY,_eZ,_f0,_f1,_ff,_f3]:E(_fa);}),[0,_f4,_f5,_f6,_f7,_f8,_fg]];}}else{return [0,_bY,new T(function(){return _ff!=_f3?[0,_eY,_eZ,_f0,_f1,_ff,_f3]:E(_fa);}),[0,_f4,_f5,_f6,_f7,_f8,_fg]];}})(_fc,_fd,_);if(_fe!=null){return _fe;}}};return _fb(_f2,_f9,_);},_fq=true,_fr=function(_fs,_ft,_fu,_fv,_fw,_fx,_fy,_fz,_){var _fA=rMV(_fs),_fB=_fA;if(!E(_fB)){if((_fx-_fz|0)>=2){var _=wMV(_fs,_fq),_=writeOffAddr("w8",1,plusAddr(_fu,_fz),0,254),_=0,_=writeOffAddr("w8",1,plusAddr(_fu,_fz+1|0),0,255),_=0,_fC=E(_ft);return _eX(_fC[1],_fC[2],_fC[3],_fC[4],_fC[5],_fC[6],_fu,_fv,_fw,_fx,_fy,_fz+2|0,_);}else{return [0,_bZ,_ft,[0,_fu,_fv,_fw,_fx,_fy,_fz]];}}else{var _fD=E(_ft);return _eX(_fD[1],_fD[2],_fD[3],_fD[4],_fD[5],_fD[6],_fu,_fv,_fw,_fx,_fy,_fz,_);}},_fE=function(_fF,_fG,_fH,_fI,_fJ,_fK,_fL,_fM,_fN,_fO,_fP,_fQ,_){var _fR=[0,_fF,_fG,_fH,_fI,0,0];return (function(_fS,_fT,_){while(1){var _fU=(function(_fV,_fW,_){if(_fW<_fO){if(_fV<_fK){if((_fV+1|0)!=_fK){var _fX=readOffAddr("w8",1,plusAddr(_fF,_fV),0),_fY=_fX,_=0,_fZ=readOffAddr("w8",1,plusAddr(_fF,_fV+1|0),0),_g0=_fZ,_=0,_g1=(_fY<<8>>>0&65535)+_g0>>>0&65535;if(_g1>=55296){if(_g1<=57343){if((_fK-_fV|0)>=4){var _g2=readOffAddr("w8",1,plusAddr(_fF,_fV+2|0),0),_g3=_g2,_=0,_g4=readOffAddr("w8",1,plusAddr(_fF,_fV+3|0),0),_g5=_g4,_=0;if(_g1<55296){return [0,_6X,new T(function(){return _fV!=_fK?[0,_fF,_fG,_fH,_fI,_fV,_fK]:E(_fR);}),[0,_fL,_fM,_fN,_fO,_fP,_fW]];}else{if(_g1>56319){return [0,_6X,new T(function(){return _fV!=_fK?[0,_fF,_fG,_fH,_fI,_fV,_fK]:E(_fR);}),[0,_fL,_fM,_fN,_fO,_fP,_fW]];}else{var _g6=(_g3<<8>>>0&65535)+_g5>>>0&65535;if(_g6<56320){return [0,_6X,new T(function(){return _fV!=_fK?[0,_fF,_fG,_fH,_fI,_fV,_fK]:E(_fR);}),[0,_fL,_fM,_fN,_fO,_fP,_fW]];}else{if(_g6>57343){return [0,_6X,new T(function(){return _fV!=_fK?[0,_fF,_fG,_fH,_fI,_fV,_fK]:E(_fR);}),[0,_fL,_fM,_fN,_fO,_fP,_fW]];}else{var _=writeOffAddr("w32",4,_fL,_fW,((((_g1&4294967295)-55296|0)<<10)+((_g6&4294967295)-56320|0)|0)+65536|0),_=0,_g7=_fV+4|0,_g8=_fW+1|0;_fS=_g7;_fT=_g8;return null;}}}}}else{return [0,_bY,new T(function(){return _fV!=_fK?[0,_fF,_fG,_fH,_fI,_fV,_fK]:E(_fR);}),[0,_fL,_fM,_fN,_fO,_fP,_fW]];}}else{var _=writeOffAddr("w32",4,_fL,_fW,_g1&4294967295),_=0,_g7=_fV+2|0,_g8=_fW+1|0;_fS=_g7;_fT=_g8;return null;}}else{var _=writeOffAddr("w32",4,_fL,_fW,_g1&4294967295),_=0,_g7=_fV+2|0,_g8=_fW+1|0;_fS=_g7;_fT=_g8;return null;}}else{return [0,_bY,new T(function(){return _fV!=_fK?[0,_fF,_fG,_fH,_fI,_fV,_fK]:E(_fR);}),[0,_fL,_fM,_fN,_fO,_fP,_fW]];}}else{return [0,_bY,new T(function(){return _fV!=_fK?[0,_fF,_fG,_fH,_fI,_fV,_fK]:E(_fR);}),[0,_fL,_fM,_fN,_fO,_fP,_fW]];}}else{return [0,_bZ,new T(function(){return _fV!=_fK?[0,_fF,_fG,_fH,_fI,_fV,_fK]:E(_fR);}),[0,_fL,_fM,_fN,_fO,_fP,_fW]];}})(_fS,_fT,_);if(_fU!=null){return _fU;}}})(_fJ,_fQ,_);},_g9=function(_ga,_gb,_gc,_gd,_ge,_gf,_gg,_gh,_gi,_gj,_gk,_gl,_){var _gm=[0,_ga,_gb,_gc,_gd,0,0];return (function(_gn,_go,_){while(1){var _gp=(function(_gq,_gr,_){if(_gr<_gj){if(_gq<_gf){if((_gq+1|0)!=_gf){var _gs=readOffAddr("w8",1,plusAddr(_ga,_gq),0),_gt=_gs,_=0,_gu=readOffAddr("w8",1,plusAddr(_ga,_gq+1|0),0),_gv=_gu,_=0,_gw=(_gv<<8>>>0&65535)+_gt>>>0&65535;if(_gw>=55296){if(_gw<=57343){if((_gf-_gq|0)>=4){var _gx=readOffAddr("w8",1,plusAddr(_ga,_gq+2|0),0),_gy=_gx,_=0,_gz=readOffAddr("w8",1,plusAddr(_ga,_gq+3|0),0),_gA=_gz,_=0;if(_gw<55296){return [0,_6X,new T(function(){return _gq!=_gf?[0,_ga,_gb,_gc,_gd,_gq,_gf]:E(_gm);}),[0,_gg,_gh,_gi,_gj,_gk,_gr]];}else{if(_gw>56319){return [0,_6X,new T(function(){return _gq!=_gf?[0,_ga,_gb,_gc,_gd,_gq,_gf]:E(_gm);}),[0,_gg,_gh,_gi,_gj,_gk,_gr]];}else{var _gB=(_gA<<8>>>0&65535)+_gy>>>0&65535;if(_gB<56320){return [0,_6X,new T(function(){return _gq!=_gf?[0,_ga,_gb,_gc,_gd,_gq,_gf]:E(_gm);}),[0,_gg,_gh,_gi,_gj,_gk,_gr]];}else{if(_gB>57343){return [0,_6X,new T(function(){return _gq!=_gf?[0,_ga,_gb,_gc,_gd,_gq,_gf]:E(_gm);}),[0,_gg,_gh,_gi,_gj,_gk,_gr]];}else{var _=writeOffAddr("w32",4,_gg,_gr,((((_gw&4294967295)-55296|0)<<10)+((_gB&4294967295)-56320|0)|0)+65536|0),_=0,_gC=_gq+4|0,_gD=_gr+1|0;_gn=_gC;_go=_gD;return null;}}}}}else{return [0,_bY,new T(function(){return _gq!=_gf?[0,_ga,_gb,_gc,_gd,_gq,_gf]:E(_gm);}),[0,_gg,_gh,_gi,_gj,_gk,_gr]];}}else{var _=writeOffAddr("w32",4,_gg,_gr,_gw&4294967295),_=0,_gC=_gq+2|0,_gD=_gr+1|0;_gn=_gC;_go=_gD;return null;}}else{var _=writeOffAddr("w32",4,_gg,_gr,_gw&4294967295),_=0,_gC=_gq+2|0,_gD=_gr+1|0;_gn=_gC;_go=_gD;return null;}}else{return [0,_bY,new T(function(){return _gq!=_gf?[0,_ga,_gb,_gc,_gd,_gq,_gf]:E(_gm);}),[0,_gg,_gh,_gi,_gj,_gk,_gr]];}}else{return [0,_bY,new T(function(){return _gq!=_gf?[0,_ga,_gb,_gc,_gd,_gq,_gf]:E(_gm);}),[0,_gg,_gh,_gi,_gj,_gk,_gr]];}}else{return [0,_bZ,new T(function(){return _gq!=_gf?[0,_ga,_gb,_gc,_gd,_gq,_gf]:E(_gm);}),[0,_gg,_gh,_gi,_gj,_gk,_gr]];}})(_gn,_go,_);if(_gp!=null){return _gp;}}})(_ge,_gl,_);},_gE=function(_gF,_gG,_){var _gH=E(_gF),_gI=E(_gG);return _fE(_gH[1],_gH[2],_gH[3],_gH[4],_gH[5],_gH[6],_gI[1],_gI[2],_gI[3],_gI[4],_gI[5],_gI[6],_);},_gJ=[1,_gE],_gK=function(_gL,_gM,_){var _gN=E(_gL),_gO=E(_gM);return _g9(_gN[1],_gN[2],_gN[3],_gN[4],_gN[5],_gN[6],_gO[1],_gO[2],_gO[3],_gO[4],_gO[5],_gO[6],_);},_gP=[1,_gK],_gQ=function(_gR,_gS,_gT,_gU,_gV,_gW,_gX,_gY,_){var _gZ=rMV(_gR),_h0=_gZ,_h1=E(_h0);if(!_h1[0]){if((_gX-_gW|0)>=2){var _h2=readOffAddr("w8",1,plusAddr(_gS,_gW),0),_h3=_h2,_=0,_h4=readOffAddr("w8",1,plusAddr(_gS,_gW+1|0),0),_h5=_h4,_=0,_h6=function(_h7){if(E(_h3)==255){if(E(_h5)==254){var _=wMV(_gR,_gP),_h8=E(_gY);return _g9(_gS,_gT,_gU,_gV,_gW+2|0,_gX,_h8[1],_h8[2],_h8[3],_h8[4],_h8[5],_h8[6],_);}else{var _=wMV(_gR,_gJ),_h9=E(_gY);return _fE(_gS,_gT,_gU,_gV,_gW,_gX,_h9[1],_h9[2],_h9[3],_h9[4],_h9[5],_h9[6],_);}}else{var _=wMV(_gR,_gJ),_ha=E(_gY);return _fE(_gS,_gT,_gU,_gV,_gW,_gX,_ha[1],_ha[2],_ha[3],_ha[4],_ha[5],_ha[6],_);}};if(E(_h3)==254){if(E(_h5)==255){var _=wMV(_gR,_gJ),_hb=E(_gY);return _fE(_gS,_gT,_gU,_gV,_gW+2|0,_gX,_hb[1],_hb[2],_hb[3],_hb[4],_hb[5],_hb[6],_);}else{return _h6(_1m);}}else{return _h6(_1m);}}else{return [0,_bY,[0,_gS,_gT,_gU,_gV,_gW,_gX],_gY];}}else{return A(_h1[1],[[0,_gS,_gT,_gU,_gV,_gW,_gX],_gY,_]);}},_hc=false,_hd=function(_){return _4;},_he=unCStr("UTF-16"),_hf=function(_hg){return [0,_he,function(_){var _hh=nMV(_6j),_hi=_hh;return [0,function(_hj,_hk,_){var _hl=E(_hj);return _gQ(_hi,_hl[1],_hl[2],_hl[3],_hl[4],_hl[5],_hl[6],_hk,_);},function(_hm,_hn,_){return _ej(_hg,_hm,_hn,_);},_hd,function(_){return rMV(_hi);},function(_ho,_){var _=wMV(_hi,_ho);return _4;}];},function(_){var _hp=nMV(_hc),_hq=_hp;return [0,function(_hr,_hs,_){var _ht=E(_hs);return _fr(_hq,_hr,_ht[1],_ht[2],_ht[3],_ht[4],_ht[5],_ht[6],_);},function(_hm,_hn,_){return _eK(_hg,_hm,_hn,_);},_hd,function(_){return rMV(_hq);},function(_hu,_){var _=wMV(_hq,_hu);return _4;}];}];},_hv=function(_hw,_hx,_){var _hy=E(_hw),_hz=E(_hx);return _eX(_hy[1],_hy[2],_hy[3],_hy[4],_hy[5],_hy[6],_hz[1],_hz[2],_hz[3],_hz[4],_hz[5],_hz[6],_);},_hA=function(_hB,_){return _4;},_hC=unCStr("UTF-16BE"),_hD=function(_hE){return [0,_hC,function(_){return [0,_gE,function(_hm,_hn,_){return _ej(_hE,_hm,_hn,_);},_hd,_hd,_hA];},function(_){return [0,_hv,function(_hm,_hn,_){return _eK(_hE,_hm,_hn,_);},_hd,_hd,_hA];}];},_hF=function(_hG,_hH,_hI,_hJ,_hK,_hL,_hM,_hN,_hO,_hP,_hQ,_hR,_){var _hS=[0,_hG,_hH,_hI,_hJ,0,0],_hT=function(_hU,_hV,_){while(1){var _hW=(function(_hX,_hY,_){if(_hX<_hL){if((_hP-_hY|0)>=2){var _hZ=readOffAddr("w32",4,_hG,_hX),_i0=_hZ,_=0,_i1=_i0;if(_i1>=65536){if((_hP-_hY|0)>=4){var _i2=_i1-65536|0,_=writeOffAddr("w8",1,plusAddr(_hM,_hY),0,_i2>>10>>>0&255),_=0,_=writeOffAddr("w8",1,plusAddr(_hM,_hY+1|0),0,((_i2>>18)+216|0)>>>0&255),_=0,_i3=die("Unsupported PrimOp: andI#"),_=writeOffAddr("w8",1,plusAddr(_hM,_hY+2|0),0,_i3>>>0&255),_=0,_=writeOffAddr("w8",1,plusAddr(_hM,_hY+3|0),0,((_i3>>8)+220|0)>>>0&255),_=0,_i4=_hX+1|0,_i5=_hY+4|0;_hU=_i4;_hV=_i5;return null;}else{return [0,_bZ,new T(function(){return _hX!=_hL?[0,_hG,_hH,_hI,_hJ,_hX,_hL]:E(_hS);}),[0,_hM,_hN,_hO,_hP,_hQ,_hY]];}}else{var _i6=function(_i7){if(56320>_i1){var _=writeOffAddr("w8",1,plusAddr(_hM,_hY),0,_i1>>>0&255),_=0,_=writeOffAddr("w8",1,plusAddr(_hM,_hY+1|0),0,_i1>>8>>>0&255),_=0;return _hT(_hX+1|0,_hY+2|0,_);}else{if(_i1>57343){var _=writeOffAddr("w8",1,plusAddr(_hM,_hY),0,_i1>>>0&255),_=0,_=writeOffAddr("w8",1,plusAddr(_hM,_hY+1|0),0,_i1>>8>>>0&255),_=0;return _hT(_hX+1|0,_hY+2|0,_);}else{return [0,_6X,new T(function(){return _hX!=_hL?[0,_hG,_hH,_hI,_hJ,_hX,_hL]:E(_hS);}),[0,_hM,_hN,_hO,_hP,_hQ,_hY]];}}};return 55296>_i1?_i6(_1m):_i1>56319?_i6(_1m):[0,_6X,new T(function(){return _hX!=_hL?[0,_hG,_hH,_hI,_hJ,_hX,_hL]:E(_hS);}),[0,_hM,_hN,_hO,_hP,_hQ,_hY]];}}else{return [0,_bZ,new T(function(){return _hX!=_hL?[0,_hG,_hH,_hI,_hJ,_hX,_hL]:E(_hS);}),[0,_hM,_hN,_hO,_hP,_hQ,_hY]];}}else{return [0,_bY,new T(function(){return _hX!=_hL?[0,_hG,_hH,_hI,_hJ,_hX,_hL]:E(_hS);}),[0,_hM,_hN,_hO,_hP,_hQ,_hY]];}})(_hU,_hV,_);if(_hW!=null){return _hW;}}};return _hT(_hK,_hR,_);},_i8=function(_i9,_ia,_){var _ib=E(_i9),_ic=E(_ia);return _hF(_ib[1],_ib[2],_ib[3],_ib[4],_ib[5],_ib[6],_ic[1],_ic[2],_ic[3],_ic[4],_ic[5],_ic[6],_);},_id=unCStr("UTF16-LE"),_ie=function(_if){return [0,_id,function(_){return [0,_gK,function(_hm,_hn,_){return _ej(_if,_hm,_hn,_);},_hd,_hd,_hA];},function(_){return [0,_i8,function(_hm,_hn,_){return _eK(_if,_hm,_hn,_);},_hd,_hd,_hA];}];},_ig=function(_ih,_ii,_ij,_ik,_il,_im,_in,_io,_ip,_iq,_ir,_is,_){var _it=[0,_ih,_ii,_ij,_ik,0,0],_iu=function(_iv,_iw,_){if(_iv<_im){if((_iq-_iw|0)>=4){var _ix=readOffAddr("w32",4,_ih,_iv),_iy=_ix,_=0,_iz=_iy,_iA=function(_iB){if(56320>_iz){var _=writeOffAddr("w8",1,plusAddr(_in,_iw),0,_iz>>24>>>0&255),_=0,_=writeOffAddr("w8",1,plusAddr(_in,_iw+1|0),0,_iz>>16>>>0&255),_=0,_=writeOffAddr("w8",1,plusAddr(_in,_iw+2|0),0,_iz>>8>>>0&255),_=0,_=writeOffAddr("w8",1,plusAddr(_in,_iw+3|0),0,_iz>>>0&255),_=0;return _iu(_iv+1|0,_iw+4|0,_);}else{if(_iz>57343){var _=writeOffAddr("w8",1,plusAddr(_in,_iw),0,_iz>>24>>>0&255),_=0,_=writeOffAddr("w8",1,plusAddr(_in,_iw+1|0),0,_iz>>16>>>0&255),_=0,_=writeOffAddr("w8",1,plusAddr(_in,_iw+2|0),0,_iz>>8>>>0&255),_=0,_=writeOffAddr("w8",1,plusAddr(_in,_iw+3|0),0,_iz>>>0&255),_=0;return _iu(_iv+1|0,_iw+4|0,_);}else{return [0,_6X,new T(function(){return _iv!=_im?[0,_ih,_ii,_ij,_ik,_iv,_im]:E(_it);}),[0,_in,_io,_ip,_iq,_ir,_iw]];}}};return 55296>_iz?_iA(_1m):_iz>56319?_iA(_1m):[0,_6X,new T(function(){return _iv!=_im?[0,_ih,_ii,_ij,_ik,_iv,_im]:E(_it);}),[0,_in,_io,_ip,_iq,_ir,_iw]];}else{return [0,_bZ,new T(function(){return _iv!=_im?[0,_ih,_ii,_ij,_ik,_iv,_im]:E(_it);}),[0,_in,_io,_ip,_iq,_ir,_iw]];}}else{return [0,_bY,new T(function(){return _iv!=_im?[0,_ih,_ii,_ij,_ik,_iv,_im]:E(_it);}),[0,_in,_io,_ip,_iq,_ir,_iw]];}};return _iu(_il,_is,_);},_iC=function(_iD,_iE,_iF,_iG,_iH,_iI,_iJ,_iK,_){var _iL=rMV(_iD),_iM=_iL;if(!E(_iM)){if((_iI-_iK|0)>=4){var _=wMV(_iD,_fq),_=writeOffAddr("w8",1,plusAddr(_iF,_iK),0,0),_=0,_=writeOffAddr("w8",1,plusAddr(_iF,_iK+1|0),0,0),_=0,_=writeOffAddr("w8",1,plusAddr(_iF,_iK+2|0),0,254),_=0,_=writeOffAddr("w8",1,plusAddr(_iF,_iK+3|0),0,255),_=0,_iN=E(_iE);return _ig(_iN[1],_iN[2],_iN[3],_iN[4],_iN[5],_iN[6],_iF,_iG,_iH,_iI,_iJ,_iK+4|0,_);}else{return [0,_bZ,_iE,[0,_iF,_iG,_iH,_iI,_iJ,_iK]];}}else{var _iO=E(_iE);return _ig(_iO[1],_iO[2],_iO[3],_iO[4],_iO[5],_iO[6],_iF,_iG,_iH,_iI,_iJ,_iK,_);}},_iP=function(_iQ,_iR,_iS,_iT,_iU,_iV,_iW,_iX,_iY,_iZ,_j0,_j1,_){var _j2=[0,_iQ,_iR,_iS,_iT,0,0],_j3=function(_j4,_j5,_){while(1){var _j6=(function(_j7,_j8,_){if(_j8<_iZ){if((_iV-_j7|0)>=4){var _j9=readOffAddr("w8",1,plusAddr(_iQ,_j7),0),_ja=_j9,_=0,_jb=readOffAddr("w8",1,plusAddr(_iQ,_j7+1|0),0),_jc=_jb,_=0,_jd=readOffAddr("w8",1,plusAddr(_iQ,_j7+2|0),0),_je=_jd,_=0,_jf=readOffAddr("w8",1,plusAddr(_iQ,_j7+3|0),0),_jg=_jf,_=0,_jh=((((_ja&4294967295)<<24)+((_jc&4294967295)<<16)|0)+((_je&4294967295)<<8)|0)+(_jg&4294967295)|0,_ji=_jh,_jj=function(_jk){if(_ji<=57343){return [0,_6X,new T(function(){return _j7!=_iV?[0,_iQ,_iR,_iS,_iT,_j7,_iV]:E(_j2);}),[0,_iW,_iX,_iY,_iZ,_j0,_j8]];}else{if(_ji>1114111){return [0,_6X,new T(function(){return _j7!=_iV?[0,_iQ,_iR,_iS,_iT,_j7,_iV]:E(_j2);}),[0,_iW,_iX,_iY,_iZ,_j0,_j8]];}else{var _=writeOffAddr("w32",4,_iW,_j8,_jh),_=0;return _j3(_j7+4|0,_j8+1|0,_);}}};if(_ji<0){return _jj(_1m);}else{if(_ji>=55296){return _jj(_1m);}else{var _=writeOffAddr("w32",4,_iW,_j8,_jh),_=0,_jl=_j7+4|0,_jm=_j8+1|0;_j4=_jl;_j5=_jm;return null;}}}else{return [0,_bY,new T(function(){return _j7!=_iV?[0,_iQ,_iR,_iS,_iT,_j7,_iV]:E(_j2);}),[0,_iW,_iX,_iY,_iZ,_j0,_j8]];}}else{return [0,_bZ,new T(function(){return _j7!=_iV?[0,_iQ,_iR,_iS,_iT,_j7,_iV]:E(_j2);}),[0,_iW,_iX,_iY,_iZ,_j0,_j8]];}})(_j4,_j5,_);if(_j6!=null){return _j6;}}};return _j3(_iU,_j1,_);},_jn=function(_jo,_jp,_jq,_jr,_js,_jt,_ju,_jv,_jw,_jx,_jy,_jz,_){var _jA=[0,_jo,_jp,_jq,_jr,0,0],_jB=function(_jC,_jD,_){while(1){var _jE=(function(_jF,_jG,_){if(_jG<_jx){if((_jt-_jF|0)>=4){var _jH=readOffAddr("w8",1,plusAddr(_jo,_jF),0),_jI=_jH,_=0,_jJ=readOffAddr("w8",1,plusAddr(_jo,_jF+1|0),0),_jK=_jJ,_=0,_jL=readOffAddr("w8",1,plusAddr(_jo,_jF+2|0),0),_jM=_jL,_=0,_jN=readOffAddr("w8",1,plusAddr(_jo,_jF+3|0),0),_jO=_jN,_=0,_jP=((((_jO&4294967295)<<24)+((_jM&4294967295)<<16)|0)+((_jK&4294967295)<<8)|0)+(_jI&4294967295)|0,_jQ=_jP,_jR=function(_jS){if(_jQ<=57343){return [0,_6X,new T(function(){return _jF!=_jt?[0,_jo,_jp,_jq,_jr,_jF,_jt]:E(_jA);}),[0,_ju,_jv,_jw,_jx,_jy,_jG]];}else{if(_jQ>1114111){return [0,_6X,new T(function(){return _jF!=_jt?[0,_jo,_jp,_jq,_jr,_jF,_jt]:E(_jA);}),[0,_ju,_jv,_jw,_jx,_jy,_jG]];}else{var _=writeOffAddr("w32",4,_ju,_jG,_jP),_=0;return _jB(_jF+4|0,_jG+1|0,_);}}};if(_jQ<0){return _jR(_1m);}else{if(_jQ>=55296){return _jR(_1m);}else{var _=writeOffAddr("w32",4,_ju,_jG,_jP),_=0,_jT=_jF+4|0,_jU=_jG+1|0;_jC=_jT;_jD=_jU;return null;}}}else{return [0,_bY,new T(function(){return _jF!=_jt?[0,_jo,_jp,_jq,_jr,_jF,_jt]:E(_jA);}),[0,_ju,_jv,_jw,_jx,_jy,_jG]];}}else{return [0,_bZ,new T(function(){return _jF!=_jt?[0,_jo,_jp,_jq,_jr,_jF,_jt]:E(_jA);}),[0,_ju,_jv,_jw,_jx,_jy,_jG]];}})(_jC,_jD,_);if(_jE!=null){return _jE;}}};return _jB(_js,_jz,_);},_jV=function(_jW,_jX,_){var _jY=E(_jW),_jZ=E(_jX);return _iP(_jY[1],_jY[2],_jY[3],_jY[4],_jY[5],_jY[6],_jZ[1],_jZ[2],_jZ[3],_jZ[4],_jZ[5],_jZ[6],_);},_k0=[1,_jV],_k1=function(_k2,_k3,_){var _k4=E(_k2),_k5=E(_k3);return _jn(_k4[1],_k4[2],_k4[3],_k4[4],_k4[5],_k4[6],_k5[1],_k5[2],_k5[3],_k5[4],_k5[5],_k5[6],_);},_k6=[1,_k1],_k7=function(_k8,_k9,_ka,_kb,_kc,_kd,_ke,_kf,_){var _kg=rMV(_k8),_kh=_kg,_ki=E(_kh);if(!_ki[0]){if((_ke-_kd|0)>=4){var _kj=readOffAddr("w8",1,plusAddr(_k9,_kd),0),_kk=_kj,_=0,_kl=readOffAddr("w8",1,plusAddr(_k9,_kd+1|0),0),_km=_kl,_=0,_kn=readOffAddr("w8",1,plusAddr(_k9,_kd+2|0),0),_ko=_kn,_=0,_kp=readOffAddr("w8",1,plusAddr(_k9,_kd+3|0),0),_kq=_kp,_=0,_kr=function(_ks){if(E(_kk)==255){if(E(_km)==254){if(!E(_ko)){if(!E(_kq)){var _=wMV(_k8,_k6),_kt=E(_kf);return _jn(_k9,_ka,_kb,_kc,_kd+4|0,_ke,_kt[1],_kt[2],_kt[3],_kt[4],_kt[5],_kt[6],_);}else{var _=wMV(_k8,_k0),_ku=E(_kf);return _iP(_k9,_ka,_kb,_kc,_kd,_ke,_ku[1],_ku[2],_ku[3],_ku[4],_ku[5],_ku[6],_);}}else{var _=wMV(_k8,_k0),_kv=E(_kf);return _iP(_k9,_ka,_kb,_kc,_kd,_ke,_kv[1],_kv[2],_kv[3],_kv[4],_kv[5],_kv[6],_);}}else{var _=wMV(_k8,_k0),_kw=E(_kf);return _iP(_k9,_ka,_kb,_kc,_kd,_ke,_kw[1],_kw[2],_kw[3],_kw[4],_kw[5],_kw[6],_);}}else{var _=wMV(_k8,_k0),_kx=E(_kf);return _iP(_k9,_ka,_kb,_kc,_kd,_ke,_kx[1],_kx[2],_kx[3],_kx[4],_kx[5],_kx[6],_);}};if(!E(_kk)){if(!E(_km)){if(E(_ko)==254){if(E(_kq)==255){var _=wMV(_k8,_k0),_ky=E(_kf);return _iP(_k9,_ka,_kb,_kc,_kd+4|0,_ke,_ky[1],_ky[2],_ky[3],_ky[4],_ky[5],_ky[6],_);}else{return _kr(_1m);}}else{return _kr(_1m);}}else{return _kr(_1m);}}else{return _kr(_1m);}}else{return [0,_bY,[0,_k9,_ka,_kb,_kc,_kd,_ke],_kf];}}else{return A(_ki[1],[[0,_k9,_ka,_kb,_kc,_kd,_ke],_kf,_]);}},_kz=function(_){return _4;},_kA=unCStr("UTF-32"),_kB=function(_kC){return [0,_kA,function(_){var _kD=nMV(_6j),_kE=_kD;return [0,function(_kF,_kG,_){var _kH=E(_kF);return _k7(_kE,_kH[1],_kH[2],_kH[3],_kH[4],_kH[5],_kH[6],_kG,_);},function(_kI,_kJ,_){return _ej(_kC,_kI,_kJ,_);},_kz,function(_){return rMV(_kE);},function(_kK,_){var _=wMV(_kE,_kK);return _4;}];},function(_){var _kL=nMV(_hc),_kM=_kL;return [0,function(_kN,_kO,_){var _kP=E(_kO);return _iC(_kM,_kN,_kP[1],_kP[2],_kP[3],_kP[4],_kP[5],_kP[6],_);},function(_kI,_kJ,_){return _eK(_kC,_kI,_kJ,_);},_kz,function(_){return rMV(_kM);},function(_kQ,_){var _=wMV(_kM,_kQ);return _4;}];}];},_kR=function(_kS,_kT,_){var _kU=E(_kS),_kV=E(_kT);return _ig(_kU[1],_kU[2],_kU[3],_kU[4],_kU[5],_kU[6],_kV[1],_kV[2],_kV[3],_kV[4],_kV[5],_kV[6],_);},_kW=function(_kX,_){return _4;},_kY=unCStr("UTF-32BE"),_kZ=function(_l0){return [0,_kY,function(_){return [0,_jV,function(_kI,_kJ,_){return _ej(_l0,_kI,_kJ,_);},_kz,_kz,_kW];},function(_){return [0,_kR,function(_kI,_kJ,_){return _eK(_l0,_kI,_kJ,_);},_kz,_kz,_kW];}];},_l1=function(_l2,_l3,_l4,_l5,_l6,_l7,_l8,_l9,_la,_lb,_lc,_ld,_){var _le=[0,_l2,_l3,_l4,_l5,0,0],_lf=function(_lg,_lh,_){if(_lg<_l7){if((_lb-_lh|0)>=4){var _li=readOffAddr("w32",4,_l2,_lg),_lj=_li,_=0,_lk=_lj,_ll=function(_lm){if(56320>_lk){var _=writeOffAddr("w8",1,plusAddr(_l8,_lh),0,_lk>>>0&255),_=0,_=writeOffAddr("w8",1,plusAddr(_l8,_lh+1|0),0,_lk>>8>>>0&255),_=0,_=writeOffAddr("w8",1,plusAddr(_l8,_lh+2|0),0,_lk>>16>>>0&255),_=0,_=writeOffAddr("w8",1,plusAddr(_l8,_lh+3|0),0,_lk>>24>>>0&255),_=0;return _lf(_lg+1|0,_lh+4|0,_);}else{if(_lk>57343){var _=writeOffAddr("w8",1,plusAddr(_l8,_lh),0,_lk>>>0&255),_=0,_=writeOffAddr("w8",1,plusAddr(_l8,_lh+1|0),0,_lk>>8>>>0&255),_=0,_=writeOffAddr("w8",1,plusAddr(_l8,_lh+2|0),0,_lk>>16>>>0&255),_=0,_=writeOffAddr("w8",1,plusAddr(_l8,_lh+3|0),0,_lk>>24>>>0&255),_=0;return _lf(_lg+1|0,_lh+4|0,_);}else{return [0,_6X,new T(function(){return _lg!=_l7?[0,_l2,_l3,_l4,_l5,_lg,_l7]:E(_le);}),[0,_l8,_l9,_la,_lb,_lc,_lh]];}}};return 55296>_lk?_ll(_1m):_lk>56319?_ll(_1m):[0,_6X,new T(function(){return _lg!=_l7?[0,_l2,_l3,_l4,_l5,_lg,_l7]:E(_le);}),[0,_l8,_l9,_la,_lb,_lc,_lh]];}else{return [0,_bZ,new T(function(){return _lg!=_l7?[0,_l2,_l3,_l4,_l5,_lg,_l7]:E(_le);}),[0,_l8,_l9,_la,_lb,_lc,_lh]];}}else{return [0,_bY,new T(function(){return _lg!=_l7?[0,_l2,_l3,_l4,_l5,_lg,_l7]:E(_le);}),[0,_l8,_l9,_la,_lb,_lc,_lh]];}};return _lf(_l6,_ld,_);},_ln=function(_lo,_lp,_){var _lq=E(_lo),_lr=E(_lp);return _l1(_lq[1],_lq[2],_lq[3],_lq[4],_lq[5],_lq[6],_lr[1],_lr[2],_lr[3],_lr[4],_lr[5],_lr[6],_);},_ls=unCStr("UTF-32LE"),_lt=function(_lu){return [0,_ls,function(_){return [0,_k1,function(_kI,_kJ,_){return _ej(_lu,_kI,_kJ,_);},_kz,_kz,_kW];},function(_){return [0,_ln,function(_kI,_kJ,_){return _eK(_lu,_kI,_kJ,_);},_kz,_kz,_kW];}];},_lv=function(_lw,_lx,_ly,_lz,_lA,_lB,_lC,_lD,_lE,_lF,_lG,_lH,_){var _lI=[0,_lw,_lx,_ly,_lz,0,0],_lJ=function(_lK,_lL,_){while(1){var _lM=(function(_lN,_lO,_){if(_lO<_lF){if(_lN<_lB){var _lP=readOffAddr("w32",4,_lw,_lN),_lQ=_lP,_=0,_lR=_lQ;if(_lR>127){if(_lR>2047){if(_lR>65535){if((_lF-_lO|0)>=4){var _=writeOffAddr("w8",1,plusAddr(_lC,_lO),0,((_lR>>18)+240|0)>>>0&255),_=0,_lS=_lR>>12,_=writeOffAddr("w8",1,plusAddr(_lC,_lO+1|0),0,(die("Unsupported PrimOp: andI#")+128|0)>>>0&255),_=0,_lT=_lR>>6,_=writeOffAddr("w8",1,plusAddr(_lC,_lO+2|0),0,(die("Unsupported PrimOp: andI#")+128|0)>>>0&255),_=0,_=writeOffAddr("w8",1,plusAddr(_lC,_lO+3|0),0,(die("Unsupported PrimOp: andI#")+128|0)>>>0&255),_=0,_lU=_lN+1|0,_lV=_lO+4|0;_lK=_lU;_lL=_lV;return null;}else{return [0,_bZ,new T(function(){return _lN!=_lB?[0,_lw,_lx,_ly,_lz,_lN,_lB]:E(_lI);}),[0,_lC,_lD,_lE,_lF,_lG,_lO]];}}else{var _lW=function(_lX){var _lY=function(_lZ){if((_lF-_lO|0)>=3){var _=writeOffAddr("w8",1,plusAddr(_lC,_lO),0,((_lR>>12)+224|0)>>>0&255),_=0,_m0=_lR>>6,_=writeOffAddr("w8",1,plusAddr(_lC,_lO+1|0),0,(die("Unsupported PrimOp: andI#")+128|0)>>>0&255),_=0,_=writeOffAddr("w8",1,plusAddr(_lC,_lO+2|0),0,(die("Unsupported PrimOp: andI#")+128|0)>>>0&255),_=0;return _lJ(_lN+1|0,_lO+3|0,_);}else{return [0,_bZ,new T(function(){return _lN!=_lB?[0,_lw,_lx,_ly,_lz,_lN,_lB]:E(_lI);}),[0,_lC,_lD,_lE,_lF,_lG,_lO]];}};return 56320>_lR?_lY(_1m):_lR>57343?_lY(_1m):[0,_6X,new T(function(){return _lN!=_lB?[0,_lw,_lx,_ly,_lz,_lN,_lB]:E(_lI);}),[0,_lC,_lD,_lE,_lF,_lG,_lO]];};return 55296>_lR?_lW(_1m):_lR>56319?_lW(_1m):[0,_6X,new T(function(){return _lN!=_lB?[0,_lw,_lx,_ly,_lz,_lN,_lB]:E(_lI);}),[0,_lC,_lD,_lE,_lF,_lG,_lO]];}}else{if((_lF-_lO|0)>=2){var _=writeOffAddr("w8",1,plusAddr(_lC,_lO),0,((_lR>>6)+192|0)>>>0&255),_=0,_=writeOffAddr("w8",1,plusAddr(_lC,_lO+1|0),0,(die("Unsupported PrimOp: andI#")+128|0)>>>0&255),_=0,_lU=_lN+1|0,_lV=_lO+2|0;_lK=_lU;_lL=_lV;return null;}else{return [0,_bZ,new T(function(){return _lN!=_lB?[0,_lw,_lx,_ly,_lz,_lN,_lB]:E(_lI);}),[0,_lC,_lD,_lE,_lF,_lG,_lO]];}}}else{var _=writeOffAddr("w8",1,plusAddr(_lC,_lO),0,_lR>>>0&255),_=0,_lU=_lN+1|0,_lV=_lO+1|0;_lK=_lU;_lL=_lV;return null;}}else{return [0,_bY,new T(function(){return _lN!=_lB?[0,_lw,_lx,_ly,_lz,_lN,_lB]:E(_lI);}),[0,_lC,_lD,_lE,_lF,_lG,_lO]];}}else{return [0,_bZ,new T(function(){return _lN!=_lB?[0,_lw,_lx,_ly,_lz,_lN,_lB]:E(_lI);}),[0,_lC,_lD,_lE,_lF,_lG,_lO]];}})(_lK,_lL,_);if(_lM!=null){return _lM;}}};return _lJ(_lA,_lH,_);},_m1=function(_m2,_m3,_){var _m4=E(_m2),_m5=E(_m3);return _lv(_m4[1],_m4[2],_m4[3],_m4[4],_m4[5],_m4[6],_m5[1],_m5[2],_m5[3],_m5[4],_m5[5],_m5[6],_);},_m6=function(_m7,_){return _4;},_m8=function(_){return _4;},_m9=function(_ma,_mb,_mc,_md,_me,_mf,_mg,_mh,_mi,_mj,_mk,_ml,_){var _mm=[0,_ma,_mb,_mc,_md,0,0],_mn=function(_mo,_mp,_){while(1){var _mq=(function(_mr,_ms,_){if(_ms<_mj){if(_mr<_mf){var _mt=readOffAddr("w8",1,plusAddr(_ma,_mr),0),_mu=_mt,_=0;if(_mu>127){var _mv=function(_mw){var _mx=function(_my){var _mz=function(_mA){if(_mu<240){return [0,_6X,new T(function(){return _mr!=_mf?[0,_ma,_mb,_mc,_md,_mr,_mf]:E(_mm);}),[0,_mg,_mh,_mi,_mj,_mk,_ms]];}else{switch(_mf-_mr|0){case 1:return [0,_bY,new T(function(){return _mr!=_mf?[0,_ma,_mb,_mc,_md,_mr,_mf]:E(_mm);}),[0,_mg,_mh,_mi,_mj,_mk,_ms]];case 2:var _mB=readOffAddr("w8",1,plusAddr(_ma,_mr+1|0),0),_mC=_mB,_=0,_mD=function(_mE){var _mF=function(_mG){return E(_mu)==244?_mC<128?[0,_6X,new T(function(){return _mr!=_mf?[0,_ma,_mb,_mc,_md,_mr,_mf]:E(_mm);}),[0,_mg,_mh,_mi,_mj,_mk,_ms]]:_mC>143?[0,_6X,new T(function(){return _mr!=_mf?[0,_ma,_mb,_mc,_md,_mr,_mf]:E(_mm);}),[0,_mg,_mh,_mi,_mj,_mk,_ms]]:[0,_bY,new T(function(){return _mr!=_mf?[0,_ma,_mb,_mc,_md,_mr,_mf]:E(_mm);}),[0,_mg,_mh,_mi,_mj,_mk,_ms]]:[0,_6X,new T(function(){return _mr!=_mf?[0,_ma,_mb,_mc,_md,_mr,_mf]:E(_mm);}),[0,_mg,_mh,_mi,_mj,_mk,_ms]];};return _mu<241?_mF(_1m):_mu>243?_mF(_1m):_mC<128?_mF(_1m):_mC>191?_mF(_1m):[0,_bY,new T(function(){return _mr!=_mf?[0,_ma,_mb,_mc,_md,_mr,_mf]:E(_mm);}),[0,_mg,_mh,_mi,_mj,_mk,_ms]];};return E(_mu)==240?_mC<144?_mD(_1m):_mC>191?_mD(_1m):[0,_bY,new T(function(){return _mr!=_mf?[0,_ma,_mb,_mc,_md,_mr,_mf]:E(_mm);}),[0,_mg,_mh,_mi,_mj,_mk,_ms]]:_mD(_1m);case 3:var _mH=readOffAddr("w8",1,plusAddr(_ma,_mr+1|0),0),_mI=_mH,_=0,_mJ=readOffAddr("w8",1,plusAddr(_ma,_mr+2|0),0),_mK=_mJ,_=0,_mL=function(_mM){var _mN=function(_mO){return E(_mu)==244?_mI<128?[0,_6X,new T(function(){return _mr!=_mf?[0,_ma,_mb,_mc,_md,_mr,_mf]:E(_mm);}),[0,_mg,_mh,_mi,_mj,_mk,_ms]]:_mI>143?[0,_6X,new T(function(){return _mr!=_mf?[0,_ma,_mb,_mc,_md,_mr,_mf]:E(_mm);}),[0,_mg,_mh,_mi,_mj,_mk,_ms]]:_mK<128?[0,_6X,new T(function(){return _mr!=_mf?[0,_ma,_mb,_mc,_md,_mr,_mf]:E(_mm);}),[0,_mg,_mh,_mi,_mj,_mk,_ms]]:_mK>191?[0,_6X,new T(function(){return _mr!=_mf?[0,_ma,_mb,_mc,_md,_mr,_mf]:E(_mm);}),[0,_mg,_mh,_mi,_mj,_mk,_ms]]:[0,_bY,new T(function(){return _mr!=_mf?[0,_ma,_mb,_mc,_md,_mr,_mf]:E(_mm);}),[0,_mg,_mh,_mi,_mj,_mk,_ms]]:[0,_6X,new T(function(){return _mr!=_mf?[0,_ma,_mb,_mc,_md,_mr,_mf]:E(_mm);}),[0,_mg,_mh,_mi,_mj,_mk,_ms]];};return _mu<241?_mN(_1m):_mu>243?_mN(_1m):_mI<128?_mN(_1m):_mI>191?_mN(_1m):_mK<128?_mN(_1m):_mK>191?_mN(_1m):[0,_bY,new T(function(){return _mr!=_mf?[0,_ma,_mb,_mc,_md,_mr,_mf]:E(_mm);}),[0,_mg,_mh,_mi,_mj,_mk,_ms]];};return E(_mu)==240?_mI<144?_mL(_1m):_mI>191?_mL(_1m):_mK<128?_mL(_1m):_mK>191?_mL(_1m):[0,_bY,new T(function(){return _mr!=_mf?[0,_ma,_mb,_mc,_md,_mr,_mf]:E(_mm);}),[0,_mg,_mh,_mi,_mj,_mk,_ms]]:_mL(_1m);default:var _mP=readOffAddr("w8",1,plusAddr(_ma,_mr+1|0),0),_mQ=_mP,_=0,_mR=readOffAddr("w8",1,plusAddr(_ma,_mr+2|0),0),_mS=_mR,_=0,_mT=readOffAddr("w8",1,plusAddr(_ma,_mr+3|0),0),_mU=_mT,_=0,_mV=function(_mW){var _mX=function(_mY){if(E(_mu)==244){if(_mQ<128){return [0,_6X,new T(function(){return _mr!=_mf?[0,_ma,_mb,_mc,_md,_mr,_mf]:E(_mm);}),[0,_mg,_mh,_mi,_mj,_mk,_ms]];}else{if(_mQ>143){return [0,_6X,new T(function(){return _mr!=_mf?[0,_ma,_mb,_mc,_md,_mr,_mf]:E(_mm);}),[0,_mg,_mh,_mi,_mj,_mk,_ms]];}else{if(_mS<128){return [0,_6X,new T(function(){return _mr!=_mf?[0,_ma,_mb,_mc,_md,_mr,_mf]:E(_mm);}),[0,_mg,_mh,_mi,_mj,_mk,_ms]];}else{if(_mS>191){return [0,_6X,new T(function(){return _mr!=_mf?[0,_ma,_mb,_mc,_md,_mr,_mf]:E(_mm);}),[0,_mg,_mh,_mi,_mj,_mk,_ms]];}else{if(_mU<128){return [0,_6X,new T(function(){return _mr!=_mf?[0,_ma,_mb,_mc,_md,_mr,_mf]:E(_mm);}),[0,_mg,_mh,_mi,_mj,_mk,_ms]];}else{if(_mU>191){return [0,_6X,new T(function(){return _mr!=_mf?[0,_ma,_mb,_mc,_md,_mr,_mf]:E(_mm);}),[0,_mg,_mh,_mi,_mj,_mk,_ms]];}else{var _=writeOffAddr("w32",4,_mg,_ms,((1048576+(((_mQ&4294967295)-128|0)<<12)|0)+(((_mS&4294967295)-128|0)<<6)|0)+((_mU&4294967295)-128|0)|0),_=0;return _mn(_mr+4|0,_ms+1|0,_);}}}}}}}else{return [0,_6X,new T(function(){return _mr!=_mf?[0,_ma,_mb,_mc,_md,_mr,_mf]:E(_mm);}),[0,_mg,_mh,_mi,_mj,_mk,_ms]];}};if(_mu<241){return _mX(_1m);}else{if(_mu>243){return _mX(_1m);}else{if(_mQ<128){return _mX(_1m);}else{if(_mQ>191){return _mX(_1m);}else{if(_mS<128){return _mX(_1m);}else{if(_mS>191){return _mX(_1m);}else{if(_mU<128){return _mX(_1m);}else{if(_mU>191){return _mX(_1m);}else{var _=writeOffAddr("w32",4,_mg,_ms,(((((_mu&4294967295)-240|0)<<18)+(((_mQ&4294967295)-128|0)<<12)|0)+(((_mS&4294967295)-128|0)<<6)|0)+((_mU&4294967295)-128|0)|0),_=0;return _mn(_mr+4|0,_ms+1|0,_);}}}}}}}}};if(E(_mu)==240){if(_mQ<144){return _mV(_1m);}else{if(_mQ>191){return _mV(_1m);}else{if(_mS<128){return _mV(_1m);}else{if(_mS>191){return _mV(_1m);}else{if(_mU<128){return _mV(_1m);}else{if(_mU>191){return _mV(_1m);}else{var _=writeOffAddr("w32",4,_mg,_ms,((((_mQ&4294967295)-128|0)<<12)+(((_mS&4294967295)-128|0)<<6)|0)+((_mU&4294967295)-128|0)|0),_=0;return _mn(_mr+4|0,_ms+1|0,_);}}}}}}}else{return _mV(_1m);}}}};if(_mu<224){return _mz(_1m);}else{if(_mu>239){return _mz(_1m);}else{switch(_mf-_mr|0){case 1:return [0,_bY,new T(function(){return _mr!=_mf?[0,_ma,_mb,_mc,_md,_mr,_mf]:E(_mm);}),[0,_mg,_mh,_mi,_mj,_mk,_ms]];case 2:var _mZ=readOffAddr("w8",1,plusAddr(_ma,_mr+1|0),0),_n0=_mZ,_=0,_n1=function(_n2){var _n3=function(_n4){var _n5=function(_n6){return _mu<238?[0,_6X,new T(function(){return _mr!=_mf?[0,_ma,_mb,_mc,_md,_mr,_mf]:E(_mm);}),[0,_mg,_mh,_mi,_mj,_mk,_ms]]:_n0<128?[0,_6X,new T(function(){return _mr!=_mf?[0,_ma,_mb,_mc,_md,_mr,_mf]:E(_mm);}),[0,_mg,_mh,_mi,_mj,_mk,_ms]]:_n0>191?[0,_6X,new T(function(){return _mr!=_mf?[0,_ma,_mb,_mc,_md,_mr,_mf]:E(_mm);}),[0,_mg,_mh,_mi,_mj,_mk,_ms]]:[0,_bY,new T(function(){return _mr!=_mf?[0,_ma,_mb,_mc,_md,_mr,_mf]:E(_mm);}),[0,_mg,_mh,_mi,_mj,_mk,_ms]];};return E(_mu)==237?_n0<128?_n5(_1m):_n0>159?_n5(_1m):[0,_bY,new T(function(){return _mr!=_mf?[0,_ma,_mb,_mc,_md,_mr,_mf]:E(_mm);}),[0,_mg,_mh,_mi,_mj,_mk,_ms]]:_n5(_1m);};return _mu<225?_n3(_1m):_mu>236?_n3(_1m):_n0<128?_n3(_1m):_n0>191?_n3(_1m):[0,_bY,new T(function(){return _mr!=_mf?[0,_ma,_mb,_mc,_md,_mr,_mf]:E(_mm);}),[0,_mg,_mh,_mi,_mj,_mk,_ms]];};return E(_mu)==224?_n0<160?_n1(_1m):_n0>191?_n1(_1m):[0,_bY,new T(function(){return _mr!=_mf?[0,_ma,_mb,_mc,_md,_mr,_mf]:E(_mm);}),[0,_mg,_mh,_mi,_mj,_mk,_ms]]:_n1(_1m);default:var _n7=readOffAddr("w8",1,plusAddr(_ma,_mr+1|0),0),_n8=_n7,_=0,_n9=readOffAddr("w8",1,plusAddr(_ma,_mr+2|0),0),_na=_n9,_=0,_nb=function(_nc){var _nd=function(_ne){var _nf=function(_ng){if(_mu<238){return [0,_6X,new T(function(){return _mr!=_mf?[0,_ma,_mb,_mc,_md,_mr,_mf]:E(_mm);}),[0,_mg,_mh,_mi,_mj,_mk,_ms]];}else{if(_n8<128){return [0,_6X,new T(function(){return _mr!=_mf?[0,_ma,_mb,_mc,_md,_mr,_mf]:E(_mm);}),[0,_mg,_mh,_mi,_mj,_mk,_ms]];}else{if(_n8>191){return [0,_6X,new T(function(){return _mr!=_mf?[0,_ma,_mb,_mc,_md,_mr,_mf]:E(_mm);}),[0,_mg,_mh,_mi,_mj,_mk,_ms]];}else{if(_na<128){return [0,_6X,new T(function(){return _mr!=_mf?[0,_ma,_mb,_mc,_md,_mr,_mf]:E(_mm);}),[0,_mg,_mh,_mi,_mj,_mk,_ms]];}else{if(_na>191){return [0,_6X,new T(function(){return _mr!=_mf?[0,_ma,_mb,_mc,_md,_mr,_mf]:E(_mm);}),[0,_mg,_mh,_mi,_mj,_mk,_ms]];}else{var _=writeOffAddr("w32",4,_mg,_ms,((((_mu&4294967295)-224|0)<<12)+(((_n8&4294967295)-128|0)<<6)|0)+((_na&4294967295)-128|0)|0),_=0;return _mn(_mr+3|0,_ms+1|0,_);}}}}}};if(E(_mu)==237){if(_n8<128){return _nf(_1m);}else{if(_n8>159){return _nf(_1m);}else{if(_na<128){return _nf(_1m);}else{if(_na>191){return _nf(_1m);}else{var _=writeOffAddr("w32",4,_mg,_ms,(53248+(((_n8&4294967295)-128|0)<<6)|0)+((_na&4294967295)-128|0)|0),_=0;return _mn(_mr+3|0,_ms+1|0,_);}}}}}else{return _nf(_1m);}};if(_mu<225){return _nd(_1m);}else{if(_mu>236){return _nd(_1m);}else{if(_n8<128){return _nd(_1m);}else{if(_n8>191){return _nd(_1m);}else{if(_na<128){return _nd(_1m);}else{if(_na>191){return _nd(_1m);}else{var _=writeOffAddr("w32",4,_mg,_ms,((((_mu&4294967295)-224|0)<<12)+(((_n8&4294967295)-128|0)<<6)|0)+((_na&4294967295)-128|0)|0),_=0;return _mn(_mr+3|0,_ms+1|0,_);}}}}}}};if(E(_mu)==224){if(_n8<160){return _nb(_1m);}else{if(_n8>191){return _nb(_1m);}else{if(_na<128){return _nb(_1m);}else{if(_na>191){return _nb(_1m);}else{var _=writeOffAddr("w32",4,_mg,_ms,(((_n8&4294967295)-128|0)<<6)+((_na&4294967295)-128|0)|0),_=0;return _mn(_mr+3|0,_ms+1|0,_);}}}}}else{return _nb(_1m);}}}}};if(_mu<194){return _mx(_1m);}else{if(_mu>223){return _mx(_1m);}else{if((_mf-_mr|0)>=2){var _nh=readOffAddr("w8",1,plusAddr(_ma,_mr+1|0),0),_ni=_nh,_=0;if(_ni>=128){if(_ni<192){var _=writeOffAddr("w32",4,_mg,_ms,(((_mu&4294967295)-192|0)<<6)+((_ni&4294967295)-128|0)|0),_=0;return _mn(_mr+2|0,_ms+1|0,_);}else{return [0,_6X,new T(function(){return _mr!=_mf?[0,_ma,_mb,_mc,_md,_mr,_mf]:E(_mm);}),[0,_mg,_mh,_mi,_mj,_mk,_ms]];}}else{return [0,_6X,new T(function(){return _mr!=_mf?[0,_ma,_mb,_mc,_md,_mr,_mf]:E(_mm);}),[0,_mg,_mh,_mi,_mj,_mk,_ms]];}}else{return [0,_bY,new T(function(){return _mr!=_mf?[0,_ma,_mb,_mc,_md,_mr,_mf]:E(_mm);}),[0,_mg,_mh,_mi,_mj,_mk,_ms]];}}}};return _mu<192?_mv(_1m):_mu>193?_mv(_1m):[0,_6X,new T(function(){return _mr!=_mf?[0,_ma,_mb,_mc,_md,_mr,_mf]:E(_mm);}),[0,_mg,_mh,_mi,_mj,_mk,_ms]];}else{var _=writeOffAddr("w32",4,_mg,_ms,_mu&4294967295),_=0,_nj=_mr+1|0,_nk=_ms+1|0;_mo=_nj;_mp=_nk;return null;}}else{return [0,_bY,new T(function(){return _mr!=_mf?[0,_ma,_mb,_mc,_md,_mr,_mf]:E(_mm);}),[0,_mg,_mh,_mi,_mj,_mk,_ms]];}}else{return [0,_bZ,new T(function(){return _mr!=_mf?[0,_ma,_mb,_mc,_md,_mr,_mf]:E(_mm);}),[0,_mg,_mh,_mi,_mj,_mk,_ms]];}})(_mo,_mp,_);if(_mq!=null){return _mq;}}};return _mn(_me,_ml,_);},_nl=function(_nm,_nn,_){var _no=E(_nm),_np=E(_nn);return _m9(_no[1],_no[2],_no[3],_no[4],_no[5],_no[6],_np[1],_np[2],_np[3],_np[4],_np[5],_np[6],_);},_nq=unCStr("UTF-8"),_nr=function(_ns){return [0,_nq,function(_){return [0,_nl,function(_nt,_nu,_){return _ej(_ns,_nt,_nu,_);},_m8,_m8,_m6];},function(_){return [0,_m1,function(_nt,_nu,_){return _eK(_ns,_nt,_nu,_);},_m8,_m8,_m6];}];},_nv=function(_nw,_nx,_){var _ny=_bN(_nx);return !_br(_ny,_by)?!_br(_ny,_bx)?!_br(_ny,_bw)?!_br(_ny,_bC)?!_br(_ny,_bB)?!_br(_ny,_bA)?!_br(_ny,_bz)?_eQ(_nw,_nx,_):new T(function(){return _nr(_nw);}):new T(function(){return _lt(_nw);}):new T(function(){return _kZ(_nw);}):new T(function(){return _kB(_nw);}):new T(function(){return _ie(_nw);}):new T(function(){return _hD(_nw);}):new T(function(){return _hf(_nw);});},_nz=function(_nA,_){var _nB=(function(_nC,_){while(1){var _nD=readOffAddr("i8",1,_nA,_nC),_nE=_nD;if(!E(_nE)){return [0,_nC];}else{var _nF=_nC+1|0;_nC=_nF;continue;}}})(0,_),_nG=_nB,_nH=E(_nG)[1];return _nH>0?(function(_nI,_nJ,_){while(1){var _nK=readOffAddr("i8",1,_nA,_nJ),_nL=_nK;if(_nJ>0){var _nM=[1,[0,_nL>>>0&255&4294967295],_nI],_nN=_nJ-1|0;_nI=_nM;_nJ=_nN;continue;}else{return [1,[0,_nL>>>0&255&4294967295],_nI];}}})(_j,_nH-1|0,_):_j;},_nO=function(_){var _=0,_nP=localeEncoding(),_nQ=_nP;return _nz(_nQ,_);},_nR=function(_nS){var _nT=A(_nS,[_]),_nU=_nT;return E(_nU);},_nV=new T(function(){return _nR(_nO);}),_nW=function(_){var _=0;return _nv(_bq,_nV,_);},_nX=new T(function(){return _nR(_nW);}),_nY=function(_){var _=0,_nZ=nMV(_nX),_o0=_nZ;return [0,function(_){return rMV(_o0);},function(_o1,_){var _=wMV(_o0,_o1);return _4;}];},_o2=new T(function(){return _nR(_nY);}),_cY=function(_o3,_o4,_o5,_o6){return _nR(function(_){var _=0,_o7=E(_o4),_o8=_o7[1],_o9=strerror(_o8),_oa=_o9,_ob=A(E(_o2)[1],[_]),_oc=_ob,_od=_aF(_oc,_oa,_),_oe=_od;return [0,_o5,new T(function(){switch(E(_o8)){case 1:return 6;case 2:return 1;case 3:return 1;case 4:return 18;case 5:return 14;case 6:return 1;case 7:return 3;case 8:return 12;case 9:return 12;case 10:return 1;case 11:return 2;case 12:return 3;case 13:return 6;case 15:return 12;case 16:return 2;case 17:return 0;case 18:return 15;case 19:return 15;case 20:return 13;case 21:return 13;case 22:return 12;case 23:return 3;case 24:return 3;case 25:return 5;case 26:return 2;case 27:return 6;case 28:return 3;case 29:return 15;case 30:return 6;case 31:return 3;case 32:return 17;case 33:return 12;case 34:return 15;case 35:return 3;case 36:return 0;case 37:return 0;case 38:return 12;case 39:return 12;case 40:return 3;case 41:return 10;case 42:return 15;case 43:return 10;case 44:return 15;case 46:return 15;case 47:return 15;case 48:return 2;case 49:return 15;case 50:return 17;case 51:return 1;case 52:return 17;case 54:return 17;case 55:return 3;case 56:return 0;case 57:return 12;case 58:return 5;case 59:return 3;case 60:return 16;case 61:return 1;case 62:return 12;case 63:return 12;case 64:return 1;case 65:return 1;case 66:return 8;case 67:return 6;case 68:return 3;case 69:return 6;case 70:return 17;case 71:return 5;case 73:return 10;case 74:return 15;case 75:return 10;case 76:return 15;case 77:return 3;case 78:return 15;case 79:return 13;case 90:return 17;case 91:return 1;case 92:return 12;case 94:return 13;case 95:return 15;case 96:return 1;case 97:return 17;case 98:return 3;case 99:return 12;case 100:return 10;case 101:return 16;case 102:return 15;default:return 11;}}),_o3,_oe,[1,_o7],_o6];});},_of=function(_og,_){var _oh=__hscore_get_errno(),_oi=_oh;return _7I(_cY(_og,[0,_oi&4294967295],_6j,_6j),_);},_oj=function(_ok,_ol,_om,_){while(1){var _on=A(_ol,[_]),_oo=_on,_op=E(_oo);if(E(_op[1])==(-1)){var _oq=__hscore_get_errno(),_or=_oq;switch(_or&4294967295){case 4:continue;case 35:return A(_om,[_]);default:return _of(_ok,_);}}else{return _op;}}},_os=unCStr("GHC.IO.FD.fdWriteNonBlocking"),_ot=function(_ou,_ov,_ow,_ox,_){var _oy=new T(function(){return [0,E(_ox)[1]>>>0];}),_oz=function(_){var _oA=_oj(_os,function(_){var _oB=ghczuwrapperZC20ZCbaseZCSystemziPosixziInternalsZCwrite(_ou,E(_ow)[1],E(_oy)[1]),_oC=_oB;return [0,_oC];},_9g,_),_oD=_oA,_oE=E(E(_oD)[1]);return _oE==(-1)?_9e:[0,_oE&4294967295];};if(!E(_ov)){var _oF=fdReady(_ou,1,0,0),_oG=_oF;if(!(_oG&4294967295)){return _9d;}else{var _oH=rtsSupportsBoundThreads(),_oI=_oH;if(!E(_oI)){var _oJ=_oz(_),_oK=_oJ;return new T(function(){return [0,E(_oK)[1]];});}else{var _oL=_oj(_os,function(_){var _oM=ghczuwrapperZC19ZCbaseZCSystemziPosixziInternalsZCwrite(_ou,E(_ow)[1],E(_oy)[1]),_oN=_oM;return [0,_oN];},_9g,_),_oO=_oL,_oP=E(E(_oO)[1]);return _oP==(-1)?_9d:[0,_oP&4294967295];}}}else{var _oQ=_oz(_),_oR=_oQ;return new T(function(){return [0,E(_oR)[1]];});}},_oS=function(_oT,_oU,_oV,_oW,_oX,_oY,_oZ,_p0,_){var _p1=_ot(_oT,_oU,[0,plusAddr(_oV,_oZ)],[0,_p0-_oZ|0],_),_p2=_p1,_=0;return [0,_p2,new T(function(){var _p3=_oZ+E(_p2)[1]|0;return _p3!=_p0?[0,_oV,_oW,_oX,_oY,_p3,_p0]:[0,_oV,_oW,_oX,_oY,0,0];})];},_p4=function(_p5,_p6,_){var _p7=E(_p5),_p8=E(_p6);return _oS(_p7[1],_p7[2],_p8[1],_p8[2],_p8[3],_p8[4],_p8[5],_p8[6],_);},_p9=[1,_9d],_pa=unCStr("GHC.IO.FD.fdReadNonBlocking"),_pb=function(_pc,_pd,_pe,_pf,_pg,_ph,_pi,_pj,_){if(!E(_pd)){var _pk=fdReady(_pc,0,0,0),_pl=_pk;if(!(_pl&4294967295)){var _=0;return [0,_p9,[0,_pe,_pf,_pg,_ph,_pi,_pj]];}else{var _pm=_oj(_pa,function(_){var _pn=ghczuwrapperZC21ZCbaseZCSystemziPosixziInternalsZCread(_pc,plusAddr(_pe,_pj),(_ph-_pj|0)>>>0),_po=_pn;return [0,_po];},_9g,_),_pp=_pm,_pq=E(E(_pp)[1]);switch(_pq){case -1:var _=0;return [0,_p9,[0,_pe,_pf,_pg,_ph,_pi,_pj]];case 0:var _=0;return [0,_6j,[0,_pe,_pf,_pg,_ph,_pi,_pj]];default:var _=0;return [0,[1,[0,_pq]],[0,_pe,_pf,_pg,_ph,_pi,_pj+_pq|0]];}}}else{var _pr=_oj(_pa,function(_){var _ps=ghczuwrapperZC22ZCbaseZCSystemziPosixziInternalsZCread(_pc,plusAddr(_pe,_pj),(_ph-_pj|0)>>>0),_pt=_ps;return [0,_pt];},_9g,_),_pu=_pr,_pv=E(E(_pu)[1]);switch(_pv){case -1:var _=0;return [0,_p9,[0,_pe,_pf,_pg,_ph,_pi,_pj]];case 0:var _=0;return [0,_6j,[0,_pe,_pf,_pg,_ph,_pi,_pj]];default:var _=0;return [0,[1,[0,_pv]],[0,_pe,_pf,_pg,_ph,_pi,_pj+_pv|0]];}}},_pw=function(_px,_py,_){var _pz=E(_px),_pA=E(_py);return _pb(_pz[1],_pz[2],_pA[1],_pA[2],_pA[3],_pA[4],_pA[5],_pA[6],_);},_pB=unCStr("GHC.IO.FD.fdRead"),_pC=[0,1],_pD=new T(function(){return E(_pC);}),_pE=function(_pF){return E(E(_pF)[1])==(-1)?true:false;},_pG=function(_pH,_pI,_){var _pJ=rMV(_pI),_pK=_pJ,_pL=E(_pK)[1],_pM=_pL["length"]-1|0,_pN=_pL[die("Unsupported PrimOp: andI#")],_pO=_pN;return (function(_pP,_){while(1){var _pQ=E(_pP);if(!_pQ[0]){return _6j;}else{if(_pQ[1]!=E(_pH)[1]){_pP=_pQ[3];continue;}else{return [1,_pQ[2]];}}}})(_pO,_);},_pR=function(_pS,_pT){while(1){var _pU=E(_pS);if(!_pU[0]){return E(_pT);}else{var _pV=E(_pU[1])[1];_pS=_pU[2];_pT=die("Unsupported PrimOp: orI#");continue;}}},_pW=[0],_pX=function(_pY){return [0,E(_pY)[3]];},_pZ=function(_q0,_q1){while(1){var _q2=(function(_q3,_q4){var _q5=E(_q4);if(!_q5[0]){return [0];}else{var _q6=_q5[1],_q7=_q5[2];if(!A(_q3,[_q6])){var _q8=_q3;_q1=_q7;_q0=_q8;return null;}else{return [1,_q6,new T(function(){return _pZ(_q3,_q7);})];}}})(_q0,_q1);if(_q2!=null){return _q2;}}},_q9=function(_qa){var _qb=_bF(0,E(_qa)[1],_j);return [1,_qb[1],_qb[2]];},_qc=function(_qd,_qe){var _qf=_bF(0,E(_qd)[1],_qe);return [1,_qf[1],_qf[2]];},_qg=function(_qh,_qi){return _z(_qc,_qh,_qi);},_qj=function(_qk,_ql,_qm){var _qn=_bF(E(_qk)[1],E(_ql)[1],_qm);return [1,_qn[1],_qn[2]];},_qo=[0,_qj,_q9,_qg],_qp=[0,0],_qq=function(_qr,_qs,_qt){return A(_qr,[[1,_w,new T(function(){return A(_qs,[_qt]);})]]);},_qu=unCStr(": empty list"),_qv=unCStr("Prelude."),_qw=function(_qx){return err(_p(_qv,function(){return _p(_qx,_qu);}));},_qy=unCStr("foldr1"),_qz=new T(function(){return _qw(_qy);}),_qA=function(_qB,_qC){var _qD=E(_qC);if(!_qD[0]){return E(_qz);}else{var _qE=_qD[1],_qF=E(_qD[2]);return _qF[0]==0?E(_qE):A(_qB,[_qE,new T(function(){return _qA(_qB,_qF);})]);}},_qG=unCStr(" out of range "),_qH=unCStr("}.index: Index "),_qI=unCStr("Ix{"),_qJ=[1,_bD,_j],_qK=[1,_bD,_qJ],_qL=[0,0],_qM=function(_qN,_qO,_qP,_qQ,_qR){return err(_p(_qI,function(){return _p(_qN,function(){return _p(_qH,[1,_bE,new T(function(){return A(_qR,[_qp,_qO,[1,_bD,new T(function(){return _p(_qG,[1,_bE,[1,_bE,new T(function(){return A(_qA,[_qq,[1,new T(function(){return A(_qR,[_qL,_qP]);}),[1,new T(function(){return A(_qR,[_qL,_qQ]);}),_j]],_qK]);})]]);})]]);})]);});}));},_qS=function(_qT,_qU,_qV,_qW){var _qX=E(_qV);return _qM(_qT,_qU,_qX[1],_qX[2],E(_qW)[1]);},_qY=function(_qZ,_r0,_r1,_r2){return _qS(_r2,_r1,_r0,_qZ);},_r3=unCStr("Int"),_r4=function(_r5,_r6,_r7){return _qY(_qo,[0,[0,_r6],[0,_r7]],[0,_r5],_r3);},_r8=unCStr("unregisterFd_"),_r9=function(_ra,_rb){return err(unAppCStr("Failed while attempting to modify registration of file ",new T(function(){var _rc=_bF(0,_rb,_j);return _p([1,_rc[1],_rc[2]],function(){return unAppCStr(" at location ",_ra);});})));},_rd=function(_re){return _r9(_r8,_re);},_rf=[0,0],_rg=function(_rh,_ri,_rj,_rk,_rl,_rm,_rn,_ro,_rp,_rq,_){var _rr=0,_rs=_rr,_rt=function(_ru,_){return (function(_rv,_){var _rw=rMV(_rv),_rx=_rw,_ry=E(_rx),_rz=_ry[1],_rA=_ry[2],_rB=_ry[3],_rC=_rz["length"]-1|0,_rD=die("Unsupported PrimOp: andI#"),_rE=_rz[_rD],_rF=_rE,_rG=function(_rH){var _rI=E(_rH);if(!_rI[0]){return [0,_6j,_6j,_pW];}else{var _rJ=_rI[1],_rK=_rI[2],_rL=_rI[3];if(_rJ!=_rp){var _rM=_rG(_rL);return [0,_rM[1],_rM[2],[1,_rJ,_rK,_rM[3]]];}else{var _rN=_pZ(function(_rO){return E(_rO)[2]!=_rq?true:false;},_rK),_rP=_rN[0]==0?[0]:[1,_rN],_rQ=E(_rP);return [0,_rP,[1,_rK],_rQ[0]==0?E(_rL):[1,_rJ,_rQ[1],_rL]];}}},_rR=_rG(_rF),_rS=function(_,_rT){var _rU=E(_rT);if(!_rU[0]){return _hc;}else{var _rV=_pG([0,_rp],_rv,_),_rW=_rV,_rX=_pR(_2P(_pX,_rU[1]),0),_rY=function(_rZ,_s0){if(_rX==_rZ){return _hc;}else{var _s1=E(_rh),_s2=A(_s1[3],[_s1[1],[0,_rp],[0,_rX],_s0,_]),_s3=_s2;return !E(_s3)?_rd(_rp):_fq;}},_s4=E(_rW);if(!_s4[0]){return _rY(0,_rf);}else{var _s5=_pR(_2P(_pX,_s4[1]),0);return _rY(_s5,[0,_s5]);}}},_s6=E(_rR[2]);if(!_s6[0]){return _rS(_,_6j);}else{var _=_rz[_rD]=_rR[3];if(!E(_rR[1])[0]){var _s7=readOffAddr("i32",4,_rA,0),_s8=_s7,_=writeOffAddr("i32",4,_rA,0,_s8-1|0),_=0;return _rS(_,_s6);}else{return _rS(_,_s6);}}})(E(_ru)[1],_);},_s9=function(){var _sa=die("Unsupported PrimOp: andI#");return _ri>_sa?_r4(_sa,_ri,_rj):_sa>_rj?_r4(_sa,_ri,_rj):E(_rk[_sa-_ri|0]);};if(!E(_rs)){return (function(_){var _sb=E(_s9)[1],_sc=takeMVar(_sb),_sd=_sc,_se=jsCatch(function(_){return (function(_){return _rt(_sd,_);})();},function(_sf,_){var _=putMVar(_sb,_sd);return die(_sf);}),_sg=_se,_=putMVar(_sb,_sd);return _sg;})();}else{var _sh=E(_s9)[1],_si=takeMVar(_sh),_sj=_si,_sk=jsCatch(function(_){return _rt(_sj,_);},function(_sl,_){var _=putMVar(_sh,_sj);return die(_sl);}),_sm=_sk,_=putMVar(_sh,_sj);return _sm;}},_sn=function(_so,_sp){return E(_so);},_sq=[0,0],_sr=unCStr("Negative range size"),_ss=new T(function(){return err(_sr);}),_st=function(_){var _=0,_su=readOffAddr("i32",4,":(",0),_sv=_su,_sw=_sv-1|0,_sx=function(_sy){if(_sy>=0){var _sz=newArr(_sy,_6j),_sA=_sz,_sB=nMV([0,E(_sq),E([0,_sw]),_sy,_sA]),_sC=_sB,_sD=0,_sE=_sD,_sF=function(_){var _sG=[0,_sC],_sH=_sG,_sI=_sH,_sJ=getOrSetSystemEventThreadEventManagerStore(_sI),_sK=_sJ;if(!addrEq(_sI,_sK)){var _sL=hs_free_stable_ptr(_sI);return _sK;}else{return _sG;}};return E(_sE)==0?_sF():_sF(_);}else{return E(_ss);}};return 0>_sw?_sx(0):_sx(_sw+1|0);},_sM=new T(function(){return _nR(_st);}),_sN=unCStr("Int"),_sO=function(_sP){return E(E(_sP)[2]);},_sQ=function(_){var _sR=die("Unsupported PrimOp: myThreadId#"),_sS=_sR,_sT=die("Unsupported PrimOp: threadStatus#"),_sU=_sT[2],_sV=rMV(E(_sM)[1]),_sW=_sV,_sX=E(_sW),_sY=E(_sX[1]),_sZ=_sY[1],_t0=E(_sX[2]);if(_sZ>_sU){return _qY(_qo,[0,_sY,_t0],[0,_sU],_sN);}else{if(_sU>_t0[1]){return _qY(_qo,[0,_sY,_t0],[0,_sU],_sN);}else{var _t1=_sX[4][_sU-_sZ|0],_t2=_t1;return new T(function(){var _t3=E(_t2);return _t3[0]==0?[0]:[1,new T(function(){return _sO(_t3[1]);})];});}}},_t4=function(_t5,_t6,_t7,_){var _t8=newArr(_t5["length"]<<1,_pW),_t9=_t8,_ta=nMV(_a1),_tb=_ta,_tc=newByteArr(8),_td=_tc,_te=_td,_=writeOffAddr("i32",4,_te,0,0),_=0,_tf=function(_tg,_th,_){if(_tg!=E(_t7)[1]){var _ti=_t5[_th],_tj=_ti;return (function(_tk,_tl,_){while(1){var _tm=E(_tl);if(!_tm[0]){return _tf(_tk,_th+1|0,_);}else{var _tn=_t9["length"]-1|0,_to=die("Unsupported PrimOp: andI#"),_tp=_t9[_to],_tq=_tp,_=_t9[_to]=[1,_tm[1],_tm[2],_tq],_tr=_tk+1|0;_tl=_tm[3];_tk=_tr;continue;}}})(_tg,_tj,_);}else{return _4;}},_ts=_tf(0,0,_),_tt=_ts,_=writeOffAddr("i32",4,_te,0,E(_t7)[1]),_=0,_=wMV(E(_t6)[1],[0,_t9,_te,[1,_td,_tb]]);return _4;},_tu=function(_tv,_tw){var _tx=E(_tv);return _tx[0]==0?E(_tw):[1,_tx[1],_tx[2],new T(function(){return _tu(_tx[3],_tw);})];},_ty=function(_tz,_tA,_tB,_tC,_){var _tD=rMV(_tC),_tE=_tD,_tF=E(_tE),_tG=_tF[1],_tH=_tF[2],_tI=_tF[3],_tJ=E(_tA),_tK=_tJ[1],_tL=_tG["length"]-1|0,_tM=die("Unsupported PrimOp: andI#"),_tN=_tG[_tM],_tO=_tN,_tP=[0,_tC];return (function(_tQ,_tR,_){while(1){var _tS=E(_tR);if(!_tS[0]){var _tT=readOffAddr("i32",4,_tH,0),_tU=_tT;if((_tU+1|0)<(_tG["length"]-(_tG["length"]>>2)|0)){var _=_tG[_tM]=[1,_tK,E(_tB),_tQ],_=writeOffAddr("i32",4,_tH,0,_tU+1|0),_=0;return _6j;}else{var _tV=_t4(_tG,_tP,[0,_tU],_),_tW=_tV,_tX=_tY(_tz,_tJ,_tB,_tP,_),_tZ=_tX,_=0;return _tZ;}}else{var _u0=_tS[1],_u1=_tS[2],_u2=_tS[3];if(_u0!=_tK){var _u3=[1,_u0,_u1,_tQ];_tR=_u2;_tQ=_u3;continue;}else{var _=_tG[_tM]=[1,_tK,A(_tz,[_tB,_u1]),_tu(_tQ,_u2)];return [1,_u1];}}}})(_pW,_tO,_);},_u4=function(_u5,_u6,_u7,_u8,_){return _ty(_u5,_u6,_u7,E(_u8)[1],_);},_tY=function(_u9,_ua,_ub,_uc,_){return _u4(_u9,_ua,_ub,_uc,_);},_ud=unCStr("Pattern match failure in do expression at GHC/Event/Thread.hs:174:3-10"),_ue=function(_uf,_ug,_uh){return _qY(_qo,[0,_ug,_uh],[0,_uf],_sN);},_ui=[0,_hc,_fq],_uj=[0,_hc,_hc],_uk=[0,_fq,_fq],_ul=new T(function(){return _2P(_pX,_j);}),_um=[0,9],_un=unCStr("threadWait"),_uo=new T(function(){return _cY(_un,_um,_6j,_6j);}),_up=function(_uq,_){var _ur=E(_uq)[1];return die("Unsupported PrimOp: andI#")==0?_4:_7I(_uo,_);},_us=unCStr("sendWakeup"),_ut=function(_uu,_uv,_){var _uw=0,_ux=_uw,_uy=function(_){var _uz=newMVar(),_uA=_uz,_uB=_sQ(_),_uC=_uB,_uD=E(_uC);if(!_uD[0]){return _6p(_ud,_);}else{var _uE=E(_uD[1]),_uF=_uE[5],_uG=_uE[6],_uH=_uE[7],_uI=_uE[12],_uJ=_uE[13],_uK=E(_uE[2]),_uL=_uK[1],_uM=E(_uE[3]),_uN=_uM[1],_uO=E(_uE[1]),_uP=(function(_){var _uQ=rMV(_uH),_uR=_uQ,_uS=[0,E(_uR)[1]+1|0],_=wMV(_uH,_uS);return _uS;})(),_uT=_uP,_uU=E(_uv),_uV=_uU[1],_uW=E(_uT)[1],_uX=E(_uu),_uY=_uX[1],_uZ=0,_v0=_uZ,_v1=function(_,_v2,_v3){var _v4=function(_){if(!E(_v2)){var _v5=jsCatch(function(_){return takeMVar(_uA);},function(_v6,_){var _v7=_rg(_uO,_uL,_uN,_uF,_uG,_uH,_uI,_uJ,_uV,_uW,_),_v8=_v7;return die(_v6);}),_v9=_v5;return _up(_v9,_);}else{var _va=newByteArr(1),_vb=_va,_vc=_vb,_vd=_vc,_ve=_vd,_=writeOffAddr("w8",1,_ve,0,255),_vf=ghczuwrapperZC20ZCbaseZCSystemziPosixziInternalsZCwrite(_uE[11]&4294967295,_ve,1),_vg=_vf,_=0;if(E(_vg)==(-1)){var _vh=__hscore_get_errno(),_vi=_vh;if((_vi&4294967295)==35){var _vj=jsCatch(function(_){return takeMVar(_uA);},function(_vk,_){var _vl=_rg(_uO,_uL,_uN,_uF,_uG,_uH,_uI,_uJ,_uV,_uW,_),_vm=_vl;return die(_vk);}),_vn=_vj;return _up(_vn,_);}else{var _vo=__hscore_get_errno(),_vp=_vo;return _7I(_cY(_us,[0,_vp&4294967295],_6j,_6j),_);}}else{var _vq=jsCatch(function(_){return takeMVar(_uA);},function(_vr,_){var _vs=_rg(_uO,_uL,_uN,_uF,_uG,_uH,_uI,_uJ,_uV,_uW,_),_vt=_vs;return die(_vr);}),_vu=_vq;return _up(_vu,_);}}};if(!E(_v3)){var _=putMVar(_uA,_uX);return _v4(_);}else{return _v4(_);}},_vv=function(_vw,_){return (function(_vx,_){var _vy=[0,_uV],_vz=_tY(_p,_vy,[1,[0,_uV,_uW,_uY,function(_vA,_vB,_){var _=putMVar(_uA,_vB);return _4;}],_j],[0,_vx],_),_vC=_vz,_vD=function(_vE,_vF){if(_vE==_vF){return _ui;}else{var _vG=A(_uO[3],[_uO[1],_uU,[0,_vE],[0,_vF],_]),_vH=_vG;if(!E(_vH)){var _vI=E(_vC);if(!_vI[0]){var _vJ=rMV(_vx),_vK=_vJ,_vL=E(_vK),_vM=_vL[1],_vN=_vL[2],_vO=_vL[3],_vP=_vM["length"]-1|0,_vQ=die("Unsupported PrimOp: andI#"),_vR=_vM[_vQ],_vS=_vR,_vT=function(_vU){var _vV=E(_vU);if(!_vV[0]){return [0,_6j,_6j,_pW];}else{var _vW=_vV[1],_vX=_vV[2],_vY=_vV[3];if(_vW!=_uV){var _vZ=_vT(_vY);return [0,_vZ[1],_vZ[2],[1,_vW,_vX,_vZ[3]]];}else{return [0,_6j,[1,_vX],E(_vY)];}}},_w0=_vT(_vS);if(!E(_w0[2])[0]){return _uj;}else{var _=_vM[_vQ]=_w0[3];if(!E(_w0[1])[0]){var _w1=readOffAddr("i32",4,_vN,0),_w2=_w1,_=writeOffAddr("i32",4,_vN,0,_w2-1|0),_=0;return _uj;}else{return _uj;}}}else{var _w3=_tY(_sn,_vy,_vI[1],[0,_vx],_),_w4=_w3;return _uj;}}else{return _uk;}}},_w5=E(_vC);if(!_w5[0]){return _vD(0,_uY);}else{var _w6=_w5[1],_w7=_pR(_2P(_pX,_w6),0),_w8=E(_w6);if(!_w8[0]){var _w9=_pR(_ul,0);return _vD(_w7,die("Unsupported PrimOp: orI#"));}else{if(!E(_w8[2])[0]){var _wa=E(_w8[1])[3];return _vD(_w7,die("Unsupported PrimOp: orI#"));}else{return _vD(_w7,die("Unsupported PrimOp: orI#"));}}}})(E(_vw)[1],_);},_wb=function(){var _wc=die("Unsupported PrimOp: andI#");return _uL>_wc?_ue(_wc,_uK,_uM):_wc>_uN?_ue(_wc,_uK,_uM):E(_uF[_wc-_uL|0]);};if(!E(_v0)){var _wd=(function(_){var _we=E(_wb)[1],_wf=takeMVar(_we),_wg=_wf,_wh=jsCatch(function(_){return (function(_){return _vv(_wg,_);})();},function(_wi,_){var _=putMVar(_we,_wg);return die(_wi);}),_wj=_wh,_=putMVar(_we,_wg);return _wj;})(),_wk=_wd,_wl=E(_wk);return _v1(_,_wl[1],_wl[2]);}else{var _wm=E(_wb)[1],_wn=takeMVar(_wm),_wo=_wn,_wp=jsCatch(function(_){return _vv(_wo,_);},function(_wq,_){var _=putMVar(_wm,_wo);return die(_wq);}),_wr=_wp,_=putMVar(_wm,_wo),_ws=E(_wr);return _v1(_,_ws[1],_ws[2]);}}};return E(_ux)==0?_uy():_uy(_);},_wt=function(_wu,_wv,_ww,_wx,_){while(1){var _wy=A(_ww,[_]),_wz=_wy;if(!A(_wu,[_wz])){return E(_wy);}else{var _wA=__hscore_get_errno(),_wB=_wA;switch(_wB&4294967295){case 4:continue;case 35:var _wC=A(_wx,[_]),_wD=_wC;continue;default:return _of(_wv,_);}}}},_wE=function(_wF,_wG,_wH,_wI,_wJ,_wK,_){var _wL=function(_wM,_){var _wN=_wt(_pE,_wF,_wM,function(_){var _wO=rtsSupportsBoundThreads(),_wP=_wO;if(!E(_wP)){var _wQ=_wG&4294967295,_=die("Unsupported PrimOp: waitRead#");return _4;}else{return _ut(_pD,[0,_wG&4294967295],_);}},_),_wR=_wN;return new T(function(){return [0,E(_wR)[1]];});},_wS=function(_){return _wL(function(_){var _wT=ghczuwrapperZC22ZCbaseZCSystemziPosixziInternalsZCread(_wG,plusAddr(E(_wI)[1],E(_wJ)[1]),E(_wK)[1]),_wU=_wT;return [0,_wU];},_);};if(!E(_wH)){var _wV=fdReady(_wG,0,0,0),_wW=_wV,_wX=function(_){var _wY=rtsSupportsBoundThreads(),_wZ=_wY;return E(_wZ)==0?_wS(_):_wL(function(_){var _x0=ghczuwrapperZC21ZCbaseZCSystemziPosixziInternalsZCread(_wG,plusAddr(E(_wI)[1],E(_wJ)[1]),E(_wK)[1]),_x1=_x0;return [0,_x1];},_);};switch(_wW&4294967295){case -1:var _x2=__hscore_get_errno(),_x3=_x2;return _7I(_cY(_wF,[0,_x3&4294967295],_6j,_6j),_);case 0:var _x4=rtsSupportsBoundThreads(),_x5=_x4;if(!E(_x5)){var _x6=_wG&4294967295,_=die("Unsupported PrimOp: waitRead#");return _wX(_);}else{var _x7=_ut(_pD,[0,_wG&4294967295],_),_x8=_x7;return _wX(_);}break;default:return _wX(_);}}else{return _wS(_);}},_x9=function(_xa,_xb,_xc,_xd,_xe,_xf,_xg,_xh,_){var _xi=_wE(_pB,_xa,_xb,[0,plusAddr(_xc,_xh)],_9d,[0,(_xf-_xh|0)>>>0],_),_xj=_xi,_=0;return [0,_xj,new T(function(){return [0,_xc,_xd,_xe,_xf,_xg,_xh+E(_xj)[1]|0];})];},_xk=function(_xl,_xm,_){var _xn=E(_xl),_xo=E(_xm);return _x9(_xn[1],_xn[2],_xo[1],_xo[2],_xo[3],_xo[4],_xo[5],_xo[6],_);},_xp=function(_xq,_xr,_){var _xs=nMV(_a1),_xt=_xs,_xu=newByteArr(8096),_xv=_xu;return [0,_xv,[1,_xv,_xt],_xr,8096,0,0];},_xw=[0,2],_xx=new T(function(){return E(_xw);}),_xy=function(_xz,_xA,_xB,_xC,_xD,_xE,_){var _xF=function(_xG,_){var _xH=_wt(_pE,_xz,_xG,function(_){var _xI=rtsSupportsBoundThreads(),_xJ=_xI;if(!E(_xJ)){var _xK=_xA&4294967295,_=die("Unsupported PrimOp: waitWrite#");return _4;}else{return _ut(_xx,[0,_xA&4294967295],_);}},_),_xL=_xH;return new T(function(){return [0,E(_xL)[1]&4294967295];});},_xM=function(_){return _xF(function(_){var _xN=ghczuwrapperZC20ZCbaseZCSystemziPosixziInternalsZCwrite(_xA,plusAddr(E(_xC)[1],E(_xD)[1]),E(_xE)[1]),_xO=_xN;return [0,_xO];},_);};if(!E(_xB)){var _xP=fdReady(_xA,1,0,0),_xQ=_xP,_xR=function(_){var _xS=rtsSupportsBoundThreads(),_xT=_xS;return E(_xT)==0?_xM(_):_xF(function(_){var _xU=ghczuwrapperZC19ZCbaseZCSystemziPosixziInternalsZCwrite(_xA,plusAddr(E(_xC)[1],E(_xD)[1]),E(_xE)[1]),_xV=_xU;return [0,_xV];},_);};if(!(_xQ&4294967295)){var _xW=rtsSupportsBoundThreads(),_xX=_xW;if(!E(_xX)){var _xY=_xA&4294967295,_=die("Unsupported PrimOp: waitWrite#");return _xR(_);}else{var _xZ=_ut(_xx,[0,_xA&4294967295],_),_y0=_xZ;return _xR(_);}}else{return _xR(_);}}else{return _xM(_);}},_y1=unCStr("GHC.IO.FD.fdWrite"),_y2=function(_y3,_y4,_y5,_y6,_){while(1){var _y7=(function(_y8,_y9,_ya,_yb,_){var _yc=_xy(_y1,_y8,_y9,_ya,_9d,new T(function(){return [0,E(_yb)[1]>>>0];}),_),_yd=_yc,_ye=E(_yd)[1],_yf=E(_yb)[1];if(_ye>=_yf){return _4;}else{var _yg=_y8,_yh=_y9;_y5=new T(function(){return [0,plusAddr(E(_ya)[1],_ye)];});_y6=[0,_yf-_ye|0];_y3=_yg;_y4=_yh;return null;}})(_y3,_y4,_y5,_y6,_);if(_y7!=null){return _y7;}}},_yi=function(_yj,_yk,_){var _yl=E(_yk),_ym=_yl[1],_yn=_yl[5],_yo=E(_yj),_yp=_y2(_yo[1],_yo[2],[0,plusAddr(_ym,_yn)],[0,_yl[6]-_yn|0],_),_yq=_yp,_=0;return [0,_ym,_yl[2],_yl[3],_yl[4],0,0];},_yr=function(_ys,_yt,_){return new T(function(){var _yu=E(_yt);return [0,_yu[1],_yu[2],_7h,_yu[4],0,0];});},_yv=[0,_xp,_xk,_pw,_yr,_yi,_p4],_yw=unCStr("GHC.IO.FD.dup2"),_yx=function(_yy,_yz,_yA,_){var _yB=dup2(_yy,_yA),_yC=_yB;if((_yC&4294967295)==(-1)){var _yD=__hscore_get_errno(),_yE=_yD;return _7I(_cY(_yw,[0,_yE&4294967295],_6j,_6j),_);}else{return [0,_yA,_yz];}},_yF=function(_yG,_yH,_){var _yI=E(_yG);return _yx(_yI[1],_yI[2],E(_yH)[1],_);},_yJ=unCStr("hGetPosn"),_yK=function(_yL){return E(E(_yL)[1])==(-1)?true:false;},_yM=function(_yN,_yO,_yP,_){while(1){var _yQ=A(_yP,[_]),_yR=_yQ;if(!A(_yN,[_yR])){return E(_yQ);}else{var _yS=__hscore_get_errno(),_yT=_yS;if((_yT&4294967295)==4){continue;}else{return _of(_yO,_);}}}},_yU=function(_yV,_){var _yW=_yM(_yK,_yJ,function(_){var _yX=ghczuwrapperZC2ZCbaseZCSystemziPosixziInternalsZCSEEKzuCUR(),_yY=_yX,_yZ=ghczuwrapperZC23ZCbaseZCSystemziPosixziInternalsZClseek(_yV,0,_yY&4294967295),_z0=_yZ;return [0,_z0];},_),_z1=_yW;return new T(function(){return _7x(E(_z1)[1]);});},_z2=function(_z3,_){return _yU(E(_z3)[1],_);},_z4=unCStr("seek"),_z5=function(_z6,_z7){var _z8=E(_z6);if(!_z8){return 0;}else{var _z9=_z7["v"]["i32"][0];return _z8>=0?E(_z9): -_z9;}},_za=function(_zb){var _zc=E(_zb);return _zc[0]==0?E(_zc[1]):_z5(_zc[1],_zc[2]);},_zd=function(_ze,_zf,_zg,_){var _zh=_yM(_yK,_z4,function(_){var _zi=_za(_zg);switch(E(_zf)){case 0:var _zj=ghczuwrapperZC1ZCbaseZCSystemziPosixziInternalsZCSEEKzuSET(),_zk=_zj,_zl=ghczuwrapperZC23ZCbaseZCSystemziPosixziInternalsZClseek(_ze,_zi,_zk&4294967295),_zm=_zl;return [0,_zm];case 1:var _zn=ghczuwrapperZC2ZCbaseZCSystemziPosixziInternalsZCSEEKzuCUR(),_zo=_zn,_zp=ghczuwrapperZC23ZCbaseZCSystemziPosixziInternalsZClseek(_ze,_zi,_zo&4294967295),_zq=_zp;return [0,_zq];default:var _zr=ghczuwrapperZC0ZCbaseZCSystemziPosixziInternalsZCSEEKzuEND(),_zs=_zr,_zt=ghczuwrapperZC23ZCbaseZCSystemziPosixziInternalsZClseek(_ze,_zi,_zs&4294967295),_zu=_zt;return [0,_zu];}},_),_zv=_zh;return _4;},_zw=function(_zx,_zy,_zz,_){return _zd(E(_zx)[1],_zy,_zz,_);},_zA=0,_zB=3,_zC=2,_zD=1,_zE=function(_zF){return E(E(_zF)[1])==(-1)?true:false;},_zG=15,_zH=unCStr("unknown file type"),_zI=unCStr("fdType"),_zJ=[0,_6j,_zG,_zI,_zH,_6j,_6j],_zK=function(_zL,_){var _zM=__hscore_sizeof_stat(),_zN=_zM,_zO=newByteArr(_zN),_zP=_zO,_zQ=_zP,_zR=_zQ,_zS=_zR,_zT=_yM(_zE,_zI,function(_){var _zU=__hscore_fstat(E(_zL)[1],_zS),_zV=_zU;return [0,_zV&4294967295];},_),_zW=_zT,_zX=__hscore_st_mode(_zS),_zY=_zX,_zZ=_zY&65535,_A0=ghczuwrapperZC29ZCbaseZCSystemziPosixziInternalsZCSzuISDIR(_zZ),_A1=_A0,_A2=function(_,_A3){var _A4=__hscore_st_dev(_zS),_A5=_A4,_A6=__hscore_st_ino(_zS),_A7=_A6,_=0;return [0,_A3,[0,_A5&4294967295],[0,_A7]];};if(!(_A1&4294967295)){var _A8=ghczuwrapperZC28ZCbaseZCSystemziPosixziInternalsZCSzuISFIFO(_zZ),_A9=_A8;if(!(_A9&4294967295)){var _Aa=ghczuwrapperZC27ZCbaseZCSystemziPosixziInternalsZCSzuISSOCK(_zZ),_Ab=_Aa;if(!(_Ab&4294967295)){var _Ac=ghczuwrapperZC31ZCbaseZCSystemziPosixziInternalsZCSzuISCHR(_zZ),_Ad=_Ac;if(!(_Ad&4294967295)){var _Ae=ghczuwrapperZC32ZCbaseZCSystemziPosixziInternalsZCSzuISREG(_zZ),_Af=_Ae;if(!(_Af&4294967295)){var _Ag=ghczuwrapperZC30ZCbaseZCSystemziPosixziInternalsZCSzuISBLK(_zZ),_Ah=_Ag;return (_Ah&4294967295)==0?_7I(_zJ,_):_A2(_,_zB);}else{return _A2(_,_zC);}}else{return _A2(_,_zD);}}else{return _A2(_,_zD);}}else{return _A2(_,_zD);}}else{return _A2(_,_zA);}},_Ai=function(_Aj,_){var _Ak=_zK(new T(function(){return [0,E(_Aj)[1]];}),_),_Al=_Ak;return new T(function(){switch(E(E(_Al)[1])){case 2:return true;case 3:return true;default:return false;}});},_Am=function(_An,_){var _Ao=isatty(E(_An)[1]),_Ap=_Ao;return new T(function(){return (_Ap&4294967295)==0?false:true;});},_Aq=function(_Ar){return E(E(_Ar)[1])==(-1)?true:false;},_As=unCStr("GHC.IO.FD.close"),_At=function(_Au,_){var _Av=_yM(_Aq,_As,function(_){var _Aw=close(_Au&4294967295),_Ax=_Aw;return [0,_Ax&4294967295];},_),_Ay=_Av;return _4;},_Az=function(_AA,_){return _At(E(_AA)[1],_);},_AB=function(_){return _4;},_AC=function(_AD,_){while(1){var _AE=E(_AD);if(!_AE[0]){return _4;}else{var _AF=E(_AE[1]),_AG=_AF[3],_AH=A(_AF[4],[[0,_AF[1],_AF[2]],[0,die("Unsupported PrimOp: orI#")],_]),_AI=_AH;_AD=_AE[2];continue;}}},_AJ=function(_AK,_){while(1){var _AL=E(_AK);if(!_AL[0]){return _4;}else{var _AM=E(_AL[1]),_AN=_AM[3],_AO=A(_AM[4],[[0,_AM[1],_AM[2]],[0,die("Unsupported PrimOp: orI#")],_]),_AP=_AO;_AK=_AL[2];continue;}}},_AQ=function(_AR,_){while(1){var _AS=E(_AR);if(!_AS[0]){return _4;}else{var _AT=E(_AS[1]),_AU=_AT[3],_AV=A(_AT[4],[[0,_AT[1],_AT[2]],[0,die("Unsupported PrimOp: orI#")],_]),_AW=_AV;_AR=_AS[2];continue;}}},_AX=[0,0],_AY=new T(function(){return E(_AX);}),_AZ=function(_B0,_B1,_B2,_){var _B3=rMV(_B1),_B4=_B3,_B5=E(_B4),_B6=_B5[1],_B7=_B5[2],_B8=_B5[3],_B9=E(_B2),_Ba=_B6["length"]-1|0,_Bb=die("Unsupported PrimOp: andI#"),_Bc=_B6[_Bb],_Bd=_Bc,_Be=function(_Bf){var _Bg=E(_Bf);if(!_Bg[0]){return [0,_6j,_6j,_pW];}else{var _Bh=_Bg[1],_Bi=_Bg[2],_Bj=_Bg[3];if(_Bh!=_B9[1]){var _Bk=_Be(_Bj);return [0,_Bk[1],_Bk[2],[1,_Bh,_Bi,_Bk[3]]];}else{return [0,_6j,[1,_Bi],E(_Bj)];}}},_Bl=_Be(_Bd),_Bm=function(_,_Bn){var _Bo=E(_Bn);if(!_Bo[0]){return _AB;}else{var _Bp=_Bo[1],_Bq=_pR(_2P(_pX,_Bp),0);if(!_Bq){return function(_){return _AQ(_Bp,_);};}else{var _Br=E(_B0),_Bs=E(_Br[1]),_Bt=A(_Bs[3],[_Bs[1],_B9,[0,_Bq],_AY,_]),_Bu=_Bt,_Bv=newByteArr(1),_Bw=_Bv,_Bx=_Bw,_By=_Bx,_Bz=_By,_=writeOffAddr("w8",1,_Bz,0,255),_BA=ghczuwrapperZC20ZCbaseZCSystemziPosixziInternalsZCwrite(_Br[11]&4294967295,_Bz,1),_BB=_BA,_=0;if(E(_BB)==(-1)){var _BC=__hscore_get_errno(),_BD=_BC;if((_BD&4294967295)==35){return function(_){return _AJ(_Bp,_);};}else{var _BE=__hscore_get_errno(),_BF=_BE;return _7I(_cY(_us,[0,_BF&4294967295],_6j,_6j),_);}}else{return function(_){return _AC(_Bp,_);};}}}},_BG=E(_Bl[2]);if(!_BG[0]){return _Bm(_,_6j);}else{var _=_B6[_Bb]=_Bl[3];if(!E(_Bl[1])[0]){var _BH=readOffAddr("i32",4,_B7,0),_BI=_BH,_=writeOffAddr("i32",4,_B7,0,_BI-1|0),_=0;return _Bm(_,_BG);}else{return _Bm(_,_BG);}}},_BJ=function(_BK,_){while(1){var _BL=E(_BK);if(!_BL[0]){return _4;}else{var _BM=A(_BL[1],[_]),_BN=_BM;_BK=_BL[2];continue;}}},_BO=function(_BP,_BQ,_){var _BR=0,_BS=_BR;if(!E(_BS)){return (function(_){var _BT=jsCatch(function(_){return _BP();},function(_BU,_){var _BV=A(_BQ,[_]),_BW=_BV;return die(_BU);}),_BX=_BT,_BY=A(_BQ,[_]),_BZ=_BY;return _BX;})();}else{var _C0=jsCatch(_BP,function(_C1,_){var _C2=A(_BQ,[_]),_C3=_C2;return die(_C1);}),_C4=_C0,_C5=A(_BQ,[_]),_C6=_C5;return _C4;}},_C7=unCStr("Pattern match failure in do expression at GHC/Event/Thread.hs:99:5-17"),_C8=function(_C9,_Ca,_Cb,_Cc){var _Cd=E(_Ca);if(!_Cd[0]){return [0];}else{var _Ce=E(_Cb);if(!_Ce[0]){return [0];}else{var _Cf=E(_Cc);return _Cf[0]==0?[0]:[1,new T(function(){return A(_C9,[_Cd[1],_Ce[1],_Cf[1]]);}),new T(function(){return _C8(_C9,_Cd[2],_Ce[2],_Cf[2]);})];}}},_Cg=function(_Ch,_Ci,_){var _Cj=rMV(E(_sM)[1]),_Ck=_Cj,_Cl=E(_Ck),_Cm=E(_Cl[1]),_Cn=_Cm[1],_Co=E(_Cl[2]),_Cp=_Co[1],_Cq=function(_,_Cr){var _Cs=0,_Ct=_Cs,_Cu=function(_){var _Cv=function(_Cw,_){var _Cx=E(_Cw);if(!_Cx[0]){return _j;}else{var _Cy=E(_Cx[1]),_Cz=E(_Cy[2]),_CA=_Cz[1],_CB=E(_Cy[3]),_CC=E(_Ci)[1],_CD=die("Unsupported PrimOp: andI#");if(_CA>_CD){return _ue(_CD,_Cz,_CB);}else{if(_CD>_CB[1]){return _ue(_CD,_Cz,_CB);}else{var _CE=takeMVar(E(_Cy[5][_CD-_CA|0])[1]),_CF=_CE,_CG=_Cv(_Cx[2],_),_CH=_CG;return [1,_CF,_CH];}}}},_CI=_Cv(_Cr,_),_CJ=_CI,_CK=function(_CL,_CM,_){var _CN=E(_CL);if(!_CN[0]){return _j;}else{var _CO=E(_CM);if(!_CO[0]){return _j;}else{var _CP=_AZ(_CN[1],E(_CO[1])[1],_Ci,_),_CQ=_CP,_CR=_CK(_CN[2],_CO[2],_),_CS=_CR;return [1,_CQ,_CS];}}},_CT=_CK(_Cr,_CJ,_),_CU=_CT,_CV=new T(function(){return _C8(function(_CW,_CX,_CY,_){var _CZ=E(_CW),_D0=E(_CZ[2]),_D1=_D0[1],_D2=E(_CZ[3]),_D3=E(_Ci)[1],_D4=die("Unsupported PrimOp: andI#");if(_D1>_D4){return _ue(_D4,_D0,_D2);}else{if(_D4>_D2[1]){return _ue(_D4,_D0,_D2);}else{var _=putMVar(E(_CZ[5][_D4-_D1|0])[1],_CX);return A(_CY,[_]);}}},_Cr,_CJ,_CU);});return _BO(new T(function(){return A(_Ch,[_Ci]);}),function(_){return _BJ(_CV,_);},_);};return E(_Ct)==0?_Cu():_Cu(_);};if(_Cn<=_Cp){var _D5=function(_D6,_){if(_Cn>_D6){return _ue(_D6,_Cm,_Co);}else{if(_D6>_Cp){return _ue(_D6,_Cm,_Co);}else{var _D7=_Cl[4][_D6-_Cn|0],_D8=_D7,_D9=E(_D8);if(!_D9[0]){return _6p(_C7,_);}else{var _Da=E(E(_D9[1])[2]);if(_D6!=_Cp){var _Db=_D5(_D6+1|0,_),_Dc=_Db;return [1,_Da,_Dc];}else{return [1,_Da,_j];}}}}},_Dd=_D5(_Cn,_),_De=_Dd;return _Cq(_,_De);}else{return _Cq(_,_j);}},_Df=function(_Dg,_){var _Dh=unlockFile(_Dg),_Di=_Dh,_Dj=rtsSupportsBoundThreads(),_Dk=_Dj;if(!E(_Dk)){var _Dl=_yM(_Aq,_As,function(_){var _Dm=close(_Dg&4294967295),_Dn=_Dm;return [0,_Dn&4294967295];},_),_Do=_Dl;return _4;}else{return _Cg(_Az,[0,_Dg&4294967295],_);}},_Dp=function(_Dq,_){return _Df(E(_Dq)[1],_);},_Dr=unCStr("Prelude.Enum.Bool.toEnum: bad argument"),_Ds=new T(function(){return err(_Dr);}),_Dt=unCStr("GHC.IO.FD.ready"),_Du=function(_Dv,_Dw,_Dx,_){var _Dy=_yM(_Aq,_Dt,function(_){var _Dz=function(_DA){var _DB=fdReady(_Dv,_DA&4294967295,_Dx&4294967295,0),_DC=_DB;return [0,_DC&4294967295];};return !E(_Dw)?_Dz(0):_Dz(1);},_),_DD=_Dy;return new T(function(){switch(E(E(_DD)[1])){case 0:return false;case 1:return true;default:return E(_Ds);}});},_DE=function(_DF,_DG,_DH,_){return _Du(E(_DF)[1],_DG,E(_DH)[1],_);},_DI=unCStr("GHC.IO.FD.dup"),_DJ=function(_DK,_DL,_){var _DM=dup(_DK),_DN=_DM,_DO=_DN&4294967295;if(_DO==(-1)){var _DP=__hscore_get_errno(),_DQ=_DP;return _7I(_cY(_DI,[0,_DQ&4294967295],_6j,_6j),_);}else{return [0,_DO,_DL];}},_DR=function(_DS,_){var _DT=E(_DS);return _DJ(_DT[1],_DT[2],_);},_DU=function(_DV,_){var _DW=_zK(new T(function(){return [0,E(_DV)[1]];}),_),_DX=_DW;return E(_DX)[1];},_DY=unCStr("sigemptyset"),_DZ=unCStr("sigaddset"),_E0=unCStr("sigprocmask"),_E1=unCStr("tcSetAttr"),_E2=3,_E3=unCStr("out of memory"),_E4=unCStr("malloc"),_E5=[0,_6j,_E2,_E4,_E3,_6j,_6j],_E6=function(_E7,_E8,_){var _E9=__hscore_sizeof_termios(),_Ea=_E9,_Eb=newByteArr(_Ea),_Ec=_Eb,_Ed=_Ec,_Ee=_Ed,_Ef=_Ee,_Eg=_yM(_zE,_E1,function(_){var _Eh=ghczuwrapperZC35ZCbaseZCSystemziPosixziInternalsZCtcgetattr(E(_E7)[1],_Ef),_Ei=_Eh;return [0,_Ei&4294967295];},_),_Ej=_Eg,_Ek=E(_E7)[1],_El=function(_){var _Em=__hscore_sizeof_sigset_t(),_En=_Em,_Eo=newByteArr(_En),_Ep=_Eo,_Eq=_Ep,_Er=_Eq,_Es=newByteArr(_En),_Et=_Es,_Eu=_Et,_Ev=_Eu,_Ew=_Er,_Ex=ghczuwrapperZC38ZCbaseZCSystemziPosixziInternalsZCsigemptyset(_Ew),_Ey=_Ex;if((_Ey&4294967295)==(-1)){var _Ez=__hscore_get_errno(),_EA=_Ez;return _7I(_cY(_DY,[0,_EA&4294967295],_6j,_6j),_);}else{var _EB=__hscore_sigttou(),_EC=_EB,_ED=ghczuwrapperZC37ZCbaseZCSystemziPosixziInternalsZCsigaddset(_Ew,_EC&4294967295),_EE=_ED;if((_EE&4294967295)==(-1)){var _EF=__hscore_get_errno(),_EG=_EF;return _7I(_cY(_DZ,[0,_EG&4294967295],_6j,_6j),_);}else{var _EH=__hscore_sig_block(),_EI=_EH,_EJ=_Ev,_EK=ghczuwrapperZC36ZCbaseZCSystemziPosixziInternalsZCsigprocmask(_EI&4294967295,_Ew,_EJ),_EL=_EK;if((_EL&4294967295)==(-1)){var _EM=__hscore_get_errno(),_EN=_EM;return _7I(_cY(_E0,[0,_EN&4294967295],_6j,_6j),_);}else{var _EO=A(_E8,[[0,_Ef],_]),_EP=_EO,_EQ=_yM(_zE,_E1,function(_){var _ER=__hscore_tcsanow(),_ES=_ER,_ET=ghczuwrapperZC34ZCbaseZCSystemziPosixziInternalsZCtcsetattr(_Ek,_ES&4294967295,_Ef),_EU=_ET;return [0,_EU&4294967295];},_),_EV=_EQ,_EW=__hscore_sig_setmask(),_EX=_EW,_EY=ghczuwrapperZC36ZCbaseZCSystemziPosixziInternalsZCsigprocmask(_EX&4294967295,_EJ,0),_EZ=_EY;if((_EZ&4294967295)==(-1)){var _F0=__hscore_get_errno(),_F1=_F0;return _7I(_cY(_E0,[0,_F1&4294967295],_6j,_6j),_);}else{var _=0,_=0,_=0;return _EP;}}}}};if(_Ek>2){return _El(_);}else{var _F2=__hscore_get_saved_termios(_Ek),_F3=_F2;if(!addrEq(_F3,0)){return _El(_);}else{var _F4=malloc(_Ea>>>0),_F5=_F4;if(!addrEq(_F5,0)){var _F6=memcpy(_F5,_Ef,_Ea>>>0),_F7=_F6,_F8=__hscore_set_saved_termios(_Ek,_F5);return _El(_);}else{return _7I(_E5,_);}}}},_F9=new T(function(){var _Fa=__hscore_icanon(),_Fb=_Fa;return [0,(_Fb&4294967295)>>>0];}),_Fc=new T(function(){var _Fd=__hscore_icanon(),_Fe=_Fd;return [0,((_Fe&4294967295)>>>0^4294967295)>>>0];}),_Ff=new T(function(){var _Fg=__hscore_vtime(),_Fh=_Fg;return [0,_Fh&4294967295];}),_Fi=new T(function(){var _Fj=__hscore_vmin(),_Fk=_Fj;return [0,_Fk&4294967295];}),_Fl=function(_Fm,_Fn,_){return _E6(_Fm,function(_Fo,_){var _Fp=E(_Fo)[1],_Fq=__hscore_lflag(_Fp),_Fr=_Fq,_Fs=function(_Ft){var _Fu=__hscore_poke_lflag(_Fp,_Ft);if(!E(_Fn)){var _Fv=__hscore_ptr_c_cc(_Fp),_Fw=_Fv,_=writeOffAddr("w8",1,plusAddr(_Fw,E(_Fi)[1]),0,1),_=writeOffAddr("w8",1,plusAddr(_Fw,E(_Ff)[1]),0,0);return _4;}else{return _4;}};return !E(_Fn)?_Fs((_Fr&E(_Fc)[1])>>>0):_Fs((_Fr|E(_F9)[1])>>>0);},_);},_Fx=function(_Fy,_Fz,_){return _Fl(new T(function(){return [0,E(_Fy)[1]];}),new T(function(){return !E(_Fz)?true:false;}),_);},_FA=new T(function(){var _FB=__hscore_echo(),_FC=_FB;return [0,(_FC&4294967295)>>>0];}),_FD=function(_FE,_){var _FF=__hscore_lflag(E(_FE)[1]),_FG=_FF;return new T(function(){return (_FG&E(_FA)[1])>>>0==0?false:true;});},_FH=function(_FI,_){return _E6(new T(function(){return [0,E(_FI)[1]];}),_FD,_);},_FJ=new T(function(){var _FK=__hscore_echo(),_FL=_FK;return [0,((_FL&4294967295)>>>0^4294967295)>>>0];}),_FM=function(_FN,_FO,_){return _E6(_FN,function(_FP,_){var _FQ=E(_FP)[1],_FR=__hscore_lflag(_FQ),_FS=_FR;if(!E(_FO)){var _FT=__hscore_poke_lflag(_FQ,(_FS&E(_FJ)[1])>>>0);return _4;}else{var _FU=__hscore_poke_lflag(_FQ,(_FS|E(_FA)[1])>>>0);return _4;}},_);},_FV=function(_FW,_FX,_){return _FM(new T(function(){return [0,E(_FW)[1]];}),_FX,_);},_FY=unCStr("GHC.IO.FD.setSize"),_FZ=function(_G0,_G1,_){var _G2=__hscore_ftruncate(_G0,_za(_G1)),_G3=_G2;if(!(_G3&4294967295)){return _4;}else{var _G4=__hscore_get_errno(),_G5=_G4;return _7I(_cY(_FY,[0,_G5&4294967295],_6j,_6j),_);}},_G6=function(_G7,_G8,_){return _FZ(E(_G7)[1],_G8,_);},_G9=[0,-1],_Ga=unCStr("fileSize"),_Gb=function(_Gc,_){var _Gd=__hscore_sizeof_stat(),_Ge=_Gd,_Gf=newByteArr(_Ge),_Gg=_Gf,_Gh=_Gg,_Gi=_Gh,_Gj=_Gi,_Gk=_yM(_zE,_Ga,function(_){var _Gl=__hscore_fstat(E(_Gc)[1],_Gj),_Gm=_Gl;return [0,_Gm&4294967295];},_),_Gn=_Gk,_Go=__hscore_st_mode(_Gj),_Gp=_Go,_Gq=ghczuwrapperZC32ZCbaseZCSystemziPosixziInternalsZCSzuISREG(_Gp&65535),_Gr=_Gq;if(!(_Gr&4294967295)){var _=0;return _G9;}else{var _Gs=__hscore_st_size(_Gj),_Gt=_Gs,_=0;return new T(function(){return _7x(_Gt);});}},_Gu=function(_Gv,_){return _Gb(new T(function(){return [0,E(_Gv)[1]];}),_);},_Gw=[0,_DE,_Dp,_Am,_Ai,_zw,_z2,_Gu,_G6,_FV,_FH,_Fx,_DU,_DR,_yF],_Gx=unCStr("FD"),_Gy=unCStr("GHC.IO.FD"),_Gz=unCStr("base"),_GA=[0,2302221327,2077833458,_Gz,_Gy,_Gx],_GB=[0,2302221327,2077833458,_GA,_j],_GC=function(_GD){return E(_GB);},_GE=3,_GF=0,_GG=function(_){var _=0;return _nv(_GF,_nV,_);},_GH=new T(function(){return _nR(_GG);}),_GI=function(_){var _=0,_GJ=nMV(_GH),_GK=_GJ;return [0,function(_){return rMV(_GK);},function(_GL,_){var _=wMV(_GK,_GL);return _4;}];},_GM=new T(function(){return _nR(_GI);}),_GN=unCStr("<stderr>"),_GO=unCStr("handle is finalized"),_GP=function(_GQ){return _T([0,_6j,_7k,_j,_GO,_6j,[1,_GQ]],_6h);},_GR=function(_GS,_GT,_){var _GU=takeMVar(_GT),_GV=_GU,_GW=E(_GV),_GX=_GW[6],_GY=_GW[11],_GZ=rMV(_GX),_H0=_GZ,_H1=function(_){if(!E(_GW[5])){var _=putMVar(_GT,new T(function(){return _GP(_GS);}));return _4;}else{var _H2=E(_GW[12]);if(!_H2[0]){var _H3=E(_GY);if(!_H3[0]){var _=putMVar(_GT,new T(function(){return _GP(_GS);}));return _4;}else{var _H4=A(E(_H3[1])[3],[_]),_H5=_H4,_=putMVar(_GT,new T(function(){return _GP(_GS);}));return _4;}}else{var _H6=A(E(_H2[1])[3],[_]),_H7=_H6,_H8=E(_GY);if(!_H8[0]){var _=putMVar(_GT,new T(function(){return _GP(_GS);}));return _4;}else{var _H9=A(E(_H8[1])[3],[_]),_Ha=_H9,_=putMVar(_GT,new T(function(){return _GP(_GS);}));return _4;}}}};if(!E(E(_H0)[3])){return _H1(_);}else{var _Hb=rMV(_GX),_Hc=_Hb,_Hd=E(_Hc);if(_Hd[5]!=_Hd[6]){var _He=A(_6J,[_GW[2],_GW[4],_Hd,_]),_Hf=_He,_=wMV(_GX,_Hf);return _H1(_);}else{return _H1(_);}}},_Hg=function(_Hh,_Hi,_){return _GR(_Hh,E(_Hi)[1],_);},_Hj=[1,_Hg],_Hk=[0],_Hl=[0],_Hm=unCStr("codec_state"),_Hn=new T(function(){return err(_Hm);}),_Ho=function(_Hp){return E(E(_Hp)[3]);},_Hq=[2,_6j],_Hr=function(_Hs){return E(E(_Hs)[1]);},_Ht=function(_Hu,_Hv,_Hw,_Hx,_Hy,_Hz,_HA,_HB,_HC,_HD,_HE,_){var _HF=function(_HG,_HH,_){var _HI=new T(function(){return E(_Hz)==2?0:1;}),_HJ=A(_Hr,[_Hv,_Hx,_HI,_]),_HK=_HJ,_HL=nMV(_HK),_HM=_HL,_HN=nMV([0,_Hn,_HK]),_HO=_HN,_HP=function(_,_HQ,_HR){var _HS=nMV(_Hk),_HT=_HS,_HU=newMVar(),_HV=_HU,_=putMVar(_HV,new T(function(){return [0,_Hu,_Hv,_Hw,E(E(_Hx)),_Hz,_HM,_HR,_HO,E(_HQ)[1],_HT,_HG,_HH,_HB,new T(function(){return E(E(_HC)[1]);}),new T(function(){return E(E(_HC)[2]);}),_HE];})),_HW=E(_HD);if(!_HW[0]){return [0,_Hy,_HV];}else{var _HX=new T(function(){return A(_HW[1],[_Hy,[0,_HV]]);}),_HY=die("Unsupported PrimOp: mkWeak#"),_HZ=_HY;return [0,_Hy,_HV];}};if(!E(_HA)){var _I0=nMV(_a1),_I1=_I0,_I2=newByteArr(8192),_I3=_I2,_I4=nMV([0,_I3,[1,_I3,_I1],_HI,2048,0,0]),_I5=_I4;return _HP(_,[0,_I5],_Hl);}else{var _I6=nMV(_a1),_I7=_I6,_I8=newByteArr(8192),_I9=_I8,_Ia=nMV([0,_I9,[1,_I9,_I7],_HI,2048,0,0]),_Ib=_Ia,_Ic=A(_Ho,[_Hu,_Hx,_]),_Id=_Ic;return _HP(_,[0,_Ib],new T(function(){return !E(_Id)?E(_Hq):[1];}));}},_Ie=E(_HB);if(!_Ie[0]){return _HF(_6j,_6j,_);}else{var _If=E(_Ie[1]),_Ig=_If[2],_Ih=_If[3],_Ii=function(_,_Ij){switch(E(_Hz)){case 3:var _Ik=A(_Ih,[_]),_Il=_Ik;return _HF([1,_Il],_Ij,_);case 4:var _Im=A(_Ih,[_]),_In=_Im;return _HF([1,_In],_Ij,_);case 5:var _Io=A(_Ih,[_]),_Ip=_Io;return _HF([1,_Ip],_Ij,_);default:return _HF(_6j,_Ij,_);}};switch(E(_Hz)){case 2:var _Iq=A(_Ig,[_]),_Ir=_Iq;return _Ii(_,[1,_Ir]);case 5:var _Is=A(_Ig,[_]),_It=_Is;return _Ii(_,[1,_It]);default:return _Ii(_,_6j);}}},_Iu=0,_Iv=[0,_Iu,_Iu],_Iw=[0,2,0],_Ix=function(_){var _=0,_Iy=A(E(_GM)[1],[_]),_Iz=_Iy;return _Ht(_Gw,_yv,_GC,_Iw,_GN,_GE,_hc,[1,_Iz],_Iv,_Hj,_6j,_);},_IA=new T(function(){return _nR(_Ix);}),_IB=function(_){return _9b(_IA,_);},_IC=function(_ID,_){var _IE=E(_ID);return _4;},_IF=unCStr("<stdout>"),_IG=[0,1,0],_IH=function(_){var _=0,_II=A(E(_GM)[1],[_]),_IJ=_II;return _Ht(_Gw,_yv,_GC,_IG,_IF,_GE,_fq,[1,_IJ],_Iv,_Hj,_6j,_);},_IK=new T(function(){return _nR(_IH);}),_IL=function(_){return _9b(_IK,_);},_IM=[0,1],_IN=[0,0],_IO=[0,2],_IP=[0,0],_IQ=function(_IR){return E(E(_IR)[2]);},_IS=function(_){return _9b(_IK,_);},_IT=function(_IU,_IV,_IW,_IX,_IY,_IZ,_){var _J0=nMV(_a1),_J1=_J0;return (function(_J2,_J3,_){while(1){var _J4=(function(_J5,_J6,_){var _J7=E(_IU),_J8=A(_J7[1],[_J5,_J6,_]),_J9=_J8,_Ja=E(_J9),_Jb=_Ja[3],_Jc=E(_Ja[2]);if(_Jc[5]!=_Jc[6]){if(E(_Ja[1])==1){return _6j;}else{var _Jd=A(_J7[2],[_Jc,_Jb,_]),_Je=_Jd,_Jf=E(_Je);_J2=_Jf[1];_J3=_Jf[2];return null;}}else{var _Jg=function(_Jh){var _Ji=E(_Jb),_Jj=_Ji[1],_Jk=_Ji[2],_Jl=_Ji[5],_Jm=_Ji[6];if(!E(_IV)){var _Jn=A(_IZ,[[0,[0,_Jj],[0,_Jm-_Jl|0]],_]),_Jo=_Jn,_=0;return [1,_Jo];}else{var _=writeOffAddr("w8",1,_Jj,_Jm,0),_Jp=A(_IZ,[[0,[0,_Jj],[0,_Jm-_Jl|0]],_]),_Jq=_Jp,_=0;return [1,_Jq];}};if(!E(_IV)){return _Jg(_1m);}else{var _Jr=E(_Jb);return (_Jr[4]-_Jr[6]|0)==0?_6j:_Jg(_1m);}}})(_J2,_J3,_);if(_J4!=null){return _J4;}}})(_IW,new T(function(){return [0,_IX,[0,_J1],_7h,E(_IY)[1],0,0];}),_);},_Js=function(_Jt){return E(E(_Jt)[4]);},_Ju=function(_Jv,_Jw,_Jx,_){var _Jy=new T(function(){return _Js(_Jv);});return (function(_Jz,_JA,_){while(1){var _JB=E(_Jz);if(!_JB[0]){return _4;}else{var _JC=A(_Jy,[_Jw,[0,_JA],_JB[1],_]),_JD=_JC;_Jz=_JB[2];var _JE=_JA+1|0;_JA=_JE;continue;}}})(_Jx,0,_);},_JF=function(_JG,_JH,_JI,_){return _a3(E(_JG)[3],_aB,function(_JJ,_){var _JK=_dj(_JH,0),_JL=newByteArr(imul(_JK,4)|0),_JM=_JL,_JN=_JM,_JO=_JN,_JP=_JO,_JQ=_Ju(_9J,[0,_JP],_JH,_),_JR=_JQ,_JS=nMV(_a1),_JT=_JS,_JU=function(_JV,_){var _JW=newByteArr(_JV),_JX=_JW,_JY=_JX,_JZ=_JY,_K0=_IT(_JJ,_fq,[0,_JP,[0,_JT],_a2,_JK,0,_JK],_JZ,[0,_JV],function(_K1){return A(_JI,[E(_K1)[1]]);},_),_K2=_K0,_K3=E(_K2);if(!_K3[0]){var _K4=_JU(imul(_JV,2)|0,_),_K5=_K4,_=0;return _K5;}else{var _=0;return _K3[1];}},_K6=_JU(_JK+1|0,_),_K7=_K6,_=0;return _K7;},_);},_K8=unCStr("no threads to run:  infinite loop or deadlock?"),_K9=unCStr("%s"),_Ka=function(_Kb,_){var _Kc=E(_Kb);return _4;},_Kd=function(_Ke){return E(E(_Ke)[1]);},_Kf=function(_Kg,_){var _Kh=E(_Kg),_Ki=_Kh[1],_Kj=_Kh[2],_Kk=jsCatch(_IS,_Ka),_Kl=_Kk,_Km=E(_o2)[1],_Kn=A(_Km,[_]),_Ko=_Kn;return _JF(_Ko,_K9,function(_Kp,_){var _Kq=A(_Km,[_]),_Kr=_Kq;return _JF(_Kr,new T(function(){var _Ks=A(_8,[_Ki,_e]),_Kt=_Ks[1],_Ku=_Ks[2],_Kv=function(_Kw){return E(_Kt)==1788961336?E(_Ku)==3513572579?E(_Kj):A(_Kd,[_IQ(_Ki),_IP,_Kj,_j]):A(_Kd,[_IQ(_Ki),_IP,_Kj,_j]);};if(E(_Kt)==51525854){if(E(_Ku)==2498035378){var _Kx=E(_Kj);return E(_K8);}else{return _Kv(_1m);}}else{return _Kv(_1m);}}),function(_Ky,_){var _Kz=errorBelch2(E(_Kp)[1],E(_Ky)[1]);return _4;},_);},_);},_KA=function(_){var _=0,_KB=nMV(_Kf),_KC=_KB;return [0,_KC];},_KD=new T(function(){return _nR(_KA);}),_KE=function(_KF,_KG,_){var _KH=jsCatch(_IL,_IC),_KI=_KH,_KJ=jsCatch(_IB,_IC),_KK=_KJ,_KL=function(_){var _KM=E(_KG),_KN=_KM[2],_KO=A(_8,[_KM[1],_e]),_KP=_KO[1],_KQ=_KO[2],_KR=function(_KS){if(E(_KP)==4053623282){if(E(_KQ)==3693590983){var _KT=E(_KN);if(E(_KT[2])==17){var _KU=E(_KT[5]);if(!_KU[0]){var _KV=rMV(E(_KD)[1]),_KW=_KV,_KX=A(_KW,[_KM,_]),_KY=_KX;return A(_KF,[_IM,_]);}else{var _KZ=E(_KT[1]);if(!_KZ[0]){var _L0=rMV(E(_KD)[1]),_L1=_L0,_L2=A(_L1,[_KM,_]),_L3=_L2;return A(_KF,[_IM,_]);}else{switch(E(E(_KU[1])[1])){case -1:var _L4=rMV(E(_KD)[1]),_L5=_L4,_L6=A(_L5,[_KM,_]),_L7=_L6;return A(_KF,[_IM,_]);case 32:var _L8=E(_KZ[1]);if(!_L8[0]){var _L9=E(_IK);if(!_L9[0]){if(!sameMVar(_L8[2],_L9[2])){var _La=rMV(E(_KD)[1]),_Lb=_La,_Lc=A(_Lb,[_KM,_]),_Ld=_Lc;return A(_KF,[_IM,_]);}else{return A(_KF,[_IN,_]);}}else{var _Le=rMV(E(_KD)[1]),_Lf=_Le,_Lg=A(_Lf,[_KM,_]),_Lh=_Lg;return A(_KF,[_IM,_]);}}else{var _Li=E(_IK);if(!_Li[0]){var _Lj=rMV(E(_KD)[1]),_Lk=_Lj,_Ll=A(_Lk,[_KM,_]),_Lm=_Ll;return A(_KF,[_IM,_]);}else{if(!sameMVar(_L8[2],_Li[2])){var _Ln=rMV(E(_KD)[1]),_Lo=_Ln,_Lp=A(_Lo,[_KM,_]),_Lq=_Lp;return A(_KF,[_IM,_]);}else{return A(_KF,[_IN,_]);}}}break;default:var _Lr=rMV(E(_KD)[1]),_Ls=_Lr,_Lt=A(_Ls,[_KM,_]),_Lu=_Lt;return A(_KF,[_IM,_]);}}}}else{var _Lv=rMV(E(_KD)[1]),_Lw=_Lv,_Lx=A(_Lw,[_KM,_]),_Ly=_Lx;return A(_KF,[_IM,_]);}}else{var _Lz=rMV(E(_KD)[1]),_LA=_Lz,_LB=A(_LA,[_KM,_]),_LC=_LB;return A(_KF,[_IM,_]);}}else{var _LD=rMV(E(_KD)[1]),_LE=_LD,_LF=A(_LE,[_KM,_]),_LG=_LF;return A(_KF,[_IM,_]);}};if(E(_KP)==1741995454){if(E(_KQ)==3139257453){var _LH=E(_KN);return _LH[0]==0?A(_KF,[_IN,_]):A(_KF,[_LH[1],_]);}else{return _KR(_1m);}}else{return _KR(_1m);}},_LI=_6D(_KG);if(!_LI[0]){return _KL(_);}else{switch(E(_LI[1])){case 0:var _LJ=die("Unsupported PrimOp: myThreadId#"),_LK=_LJ,_LL=stackOverflow(_LK);return A(_KF,[_IO,_]);case 3:return _6r(0,-2,_);default:return _KL(_);}}},_LM=function(_LN,_){return jsCatch(function(_){return _KE(_6B,_LN,_);},_LO);},_LO=function(_LP,_){return _LM(_LP,_);},_LQ=function(_LR,_LS,_LT,_){while(1){var _LU=E(_LS);if(!_LU){return _4;}else{var _LV=E(_LT)[1],_LW=E(_LR),_=writeOffAddr("w8",1,_LW[1],_LU-1|0,_LV&255);_LR=_LW;_LS=_LU-1|0;_LT=[0,_LV>>>8];continue;}}},_LX=function(_LY){return [0,E(_LY)[1]];},_LZ=function(_M0,_M1,_M2,_){var _M3=_LQ(function(){return _LX(_M0);},8,[0,_M1],_),_M4=_M3;return _LQ(function(){return [0,plusAddr(E(_M0)[1],8)];},8,[0,_M2],_);},_M5=function(_M6,_M7,_){var _M8=E(_M7);return _LZ(_M6,_M8[1],_M8[2],_);},_M9=function(_Ma,_Mb){return [0,E(_Ma)[1],E(_Mb)[1]];},_Mc=function(_Md,_Me,_Mf,_){while(1){var _Mg=E(_Me);if(!_Mg){return [0,_Mf];}else{var _Mh=E(_Md)[1],_Mi=readOffAddr("w8",1,_Mh,0),_Mj=_Mi;_Md=[0,plusAddr(_Mh,1)];_Me=_Mg-1|0;var _Mk=(_Mf<<8>>>0|_Mj)>>>0;_Mf=_Mk;continue;}}},_Ml=function(_Mm,_){var _Mn=_Mc(function(){return _LX(_Mm);},8,0,_),_Mo=_Mn,_Mp=_Mc(function(){return [0,plusAddr(E(_Mm)[1],8)];},8,0,_),_Mq=_Mp;return new T(function(){return _M9(_Mo,_Mq);});},_Mr=function(_Ms,_Mt,_Mu,_){var _Mv=E(_Mu);return _LZ(new T(function(){return [0,plusAddr(E(_Ms)[1],E(_Mt)[1])];}),_Mv[1],_Mv[2],_);},_Mw=function(_Mx,_My,_){return _Ml(new T(function(){return [0,plusAddr(E(_Mx)[1],E(_My)[1])];}),_);},_Mz=function(_MA,_MB,_MC,_){var _MD=E(_MC);return _LZ(new T(function(){return [0,plusAddr(E(_MA)[1],imul(E(_MB)[1],16)|0)];}),_MD[1],_MD[2],_);},_ME=function(_MF,_MG,_){return _Ml(new T(function(){return [0,plusAddr(E(_MF)[1],imul(E(_MG)[1],16)|0)];}),_);},_MH=[0,8],_MI=function(_MJ){return E(_MH);},_MK=[0,16],_ML=function(_MM){return E(_MK);},_MN=[0,_ML,_MI,_ME,_Mz,_Mw,_Mr,_Ml,_M5],_MO=function(_MP,_MQ,_){var _MR=newByteArr(88),_MS=_MR,_MT=_MS,_MU=_MT,_MV=_MU,_MW=__hsbase_MD5Init(_MV),_MX=__hsbase_MD5Update(_MV,E(_MP)[1],E(_MQ)[1]&4294967295),_MY=newByteArr(16),_MZ=_MY,_N0=_MZ,_N1=_N0,_N2=_N1,_N3=__hsbase_MD5Final(_N2,_MV),_N4=_Ml([0,_N2],_),_N5=_N4,_=0,_=0;return _N5;},_N6=function(_N7){return _nR(function(_){var _N8=_dj(_N7,0),_N9=newByteArr(imul(_N8,16)|0),_Na=_N9,_Nb=_Na,_Nc=_Nb,_Nd=_Nc,_Ne=_Ju(_MN,[0,_Nd],_N7,_),_Nf=_Ne,_Ng=_MO([0,_Nd],[0,imul(_N8,16)|0],_),_Nh=_Ng,_=0;return _Nh;});},_Ni=unCStr("ghc-prim"),_Nj=unCStr("GHC.Types"),_Nk=unCStr("IO"),_Nl=[0,1456544454,3588501173,_Ni,_Nj,_Nk],_Nm=function(_Nn){var _No=E(_Nn);if(!_No[0]){return [0];}else{var _Np=E(_No[1]);return [1,[0,_Np[1],_Np[2]],new T(function(){return _Nm(_No[2]);})];}},_Nq=unCStr("()"),_Nr=unCStr("GHC.Tuple"),_Ns=[0,2170319554,26914641,_Ni,_Nr,_Nq],_Nt=[0,2170319554,26914641,_Ns,_j],_Nu=[1,_Nt,_j],_Nv=new T(function(){return _Nm(_Nu);}),_Nw=[0,1456544454,3588501173],_Nx=[1,_Nw,_Nv],_Ny=new T(function(){var _Nz=_N6(_Nx);return [0,_Nz[1],_Nz[2],_Nl,_Nu];}),_NA=unCStr("AsyncException"),_NB=[0,2363394409,2156861182,_5e,_5f,_NA],_NC=[0,2363394409,2156861182,_NB,_j],_ND=function(_NE){return E(_NC);},_NF=unCStr("user interrupt"),_NG=unCStr("thread killed"),_NH=unCStr("heap overflow"),_NI=unCStr("stack overflow"),_NJ=function(_NK){switch(E(_NK)){case 0:return E(_NI);case 1:return E(_NH);case 2:return E(_NG);default:return E(_NF);}},_NL=function(_6i){return _p(_NF,_6i);},_NM=function(_6i){return _p(_NG,_6i);},_NN=function(_6i){return _p(_NH,_6i);},_NO=function(_6i){return _p(_NI,_6i);},_NP=function(_NQ){switch(E(_NQ)){case 0:return E(_NO);case 1:return E(_NN);case 2:return E(_NM);default:return E(_NL);}},_NR=function(_NS,_NT){return _z(_NP,_NS,_NT);},_NU=function(_NV,_NW){switch(E(_NW)){case 0:return E(_NO);case 1:return E(_NN);case 2:return E(_NM);default:return E(_NL);}},_NX=[0,_NU,_NJ,_NR],_NY=new T(function(){return [0,_ND,_NX,_NZ,_6D];}),_O0=function(_O1){var _O2=E(_O1),_O3=A(_8,[_O2[1],_e]);return E(_O3[1])==2677205718?E(_O3[2])==3454527707?[1,_O2[2]]:[0]:[0];},_O4=unCStr("SomeAsyncException"),_O5=[0,2677205718,3454527707,_5e,_5f,_O4],_O6=[0,2677205718,3454527707,_O5,_j],_O7=function(_O8){return E(_O6);},_O9=function(_Oa){return E(E(_Oa)[2]);},_Ob=function(_Oc){var _Od=E(_Oc);return A(_O9,[_IQ(_Od[1]),_Od[2]]);},_Oe=function(_Of,_Og){var _Oh=E(_Of);return _p(A(_O9,[_IQ(_Oh[1]),_Oh[2]]),_Og);},_Oi=function(_Oj,_Ok){return _z(_Oe,_Oj,_Ok);},_Ol=function(_Om,_On,_Oo){var _Op=E(_On);return _p(A(_O9,[_IQ(_Op[1]),_Op[2]]),_Oo);},_Oq=[0,_Ol,_Ob,_Oi],_Or=new T(function(){return [0,_O7,_Oq,_Os,_O0];}),_Os=function(_6i){return [0,_Or,_6i];},_NZ=function(_Ot){return _Os([0,_NY,_Ot]);},_Ou=3,_Ov=new T(function(){return _NZ(_Ou);}),_Ow=[0,2],_Ox=unCStr("GHC.Conc.setHandler: signal out of range"),_Oy=new T(function(){return err(_Ox);}),_Oz=[0,0],_OA=[0,64],_OB=function(_){var _=0,_OC=newArr(65,_6j),_OD=_OC,_OE=newMVar(),_OF=_OE,_=putMVar(_OF,[0,E(_Oz),E(_OA),65,_OD]),_OG=0,_OH=_OG,_OI=function(_){var _OJ=[0,_OF],_OK=_OJ,_OL=_OK,_OM=getOrSetGHCConcSignalSignalHandlerStore(_OL),_ON=_OM;if(!addrEq(_OL,_ON)){var _OO=hs_free_stable_ptr(_OL);return _ON;}else{return _OJ;}};return E(_OH)==0?_OI():_OI(_);},_OP=new T(function(){return _nR(_OB);}),_OQ=function(_OR,_OS,_){var _OT=0,_OU=_OT,_OV=function(_OW,_){var _OX=E(_OW),_OY=_OX[4],_OZ=E(_OR)[1];if(E(_OX[1])[1]>_OZ){return E(_Oy);}else{if(_OZ>E(_OX[2])[1]){return E(_Oy);}else{var _P0=_OY[_OZ],_P1=_P0,_=_OY[_OZ]=_OS;return _P1;}}};if(!E(_OU)){return (function(_){var _P2=E(_OP)[1],_P3=takeMVar(_P2),_P4=_P3,_P5=jsCatch(function(_){return (function(_){return _OV(_P4,_);})();},function(_P6,_){var _=putMVar(_P2,_P4);return die(_P6);}),_P7=_P5,_=putMVar(_P2,_P4);return _P7;})();}else{var _P8=E(_OP)[1],_P9=takeMVar(_P8),_Pa=_P9,_Pb=jsCatch(function(_){return _OV(_Pa,_);},function(_Pc,_){var _=putMVar(_P8,_Pa);return die(_Pc);}),_Pd=_Pb,_=putMVar(_P8,_Pa);return _Pd;}},_Pe=function(_Pf,_){return jsCatch(function(_){var _Pg=die("Unsupported PrimOp: myThreadId#"),_Ph=_Pg,_Pi=[0,_Ph],_Pj=die("Unsupported PrimOp: mkWeakNoFinalizer#"),_Pk=_Pj,_Pl=_OQ(_Ow,[1,[0,function(_Pm,_){var _Pn=die("Unsupported PrimOp: deRefWeak#");if(!E(_Pn[1])){return _4;}else{var _Po=E(_Pn[2])[1],_=die("Unsupported PrimOp: killThread#");return _4;}},[0,_Ny,function(_){var _Pp=die("Unsupported PrimOp: deRefWeak#");if(!E(_Pp[1])){return _4;}else{var _Pq=E(_Pp[2])[1],_=die("Unsupported PrimOp: killThread#");return _4;}}]]],_),_Pr=_Pl,_Ps=stg_sig_install(2,-5,0),_Pt=_Ps;return A(_Pf,[_]);},_LO);},_Pu=function(_){return _Pe(_56,_);},_Pv=function(_){return _Pu(_);};
var hasteMain = function() {A(_Pv, [0]);};window.onload = hasteMain;