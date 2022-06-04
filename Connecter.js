// ドラッグ&ドロップエリアの取得
var fileArea = document.getElementById("dropArea");

// input[type=file]の取得
var fileInput = document.getElementById("inputFile");

var gFiles = null;

// ドラッグオーバー時の処理
fileInput.addEventListener("dragover", function(e){
    e.preventDefault();
    fileInput.classList.add("dragover");
});

// ドラッグアウト時の処理
fileInput.addEventListener("dragleave", function(e){
    e.preventDefault();
    fileInput.classList.remove("dragover");
});

// ドロップ時の処理
fileInput.addEventListener("drop", function(e) {
    e.preventDefault();
    fileInput.classList.remove("dragover");

    // ドロップしたファイルの取得
    let files = e.dataTransfer.files;
    setFiles(Array.from(files));
    // if(typeof files[0] !== "undefined") {
    //     //ファイルが正常に受け取れた際の処理
    //     readFile(files[0]);
    // } else {
    //     //ファイルが受け取れなかった際の処理
    // }
});

function setFiles(files) {
    fileInput.files = files;
    for(let i = 0; i < files.length; i++) {
        for(let j = 1; j < files.length - i; j++) {
            let j0 = files[j - 1].name.match(/(\d+)\D+/)[1];
            let j1 = files[j].name.match(/(\d+)\D+/)[1];
            if(Number(j0) > Number(j1)) {
                let temp = files[j];
                files[j] = files[j - 1];
                files[j - 1] = temp;
            }
        }
    }
    gFiles = files;
    let list = document.getElementById("fileList");
    let inner= "<p>" + files[0].name + "</p>";
    for(let i = 1; i < files.length; i++) {
        inner += "<p>" + files[i].name + "</p>";
    }
    list.innerHTML = inner;
    // if(typeof e.target.files[0] !== "undefined") {
    //     // ファイルが正常に受け取れた際の処理
    //     readFile(file);
    // } else {
    //     // ファイルが受け取れなかった際の処理
    // }
}

// input[type=file]に変更があれば実行
// もちろんドロップ以外でも発火します
fileInput.addEventListener("change", function(e){
    let files = e.target.files;
    setFiles(Array.from(files));
}, false);

function loadFile(file) {
    return new Promise((resolve, reject) => {
        let reader = new FileReader();
        reader.readAsText(file, "shift-jis");
        reader.onload = () => resolve(reader.result);
        reader.onerror = (e) => reject(e);
    });
}

async function connect() {
    if(gFiles == null) return;
    if(gFiles.length <= 1) return;
    let textFiles = [];
    for(let i = 0; i < gFiles.length; i++){    
        textFiles[i] = await loadFile(gFiles[i]);
    }
    let result = textFiles[0];
    for(let i = 1; i < textFiles.length; i++) {    
        result = merge(result, textFiles[i]);
    }
    downloadText("result.bms", result);
}

function merge(fileA, fileB) {
    let strsA = fileA.split("\r\n");
    let strsB = fileB.split("\r\n");
    let scrollDict = [];
    let bpmDict = [];
    let stopDict = [];
    appendSoflan(strsA, scrollDict, bpmDict, stopDict);
    appendSoflan(strsB, scrollDict, bpmDict, stopDict);
    filter(scrollDict);
    filter(bpmDict);
    filter(stopDict);
    let result = "";
    let soflanFlag = false;
    let chartFlag = false;
    let offset = 0;
    for(let str of strsA) {
        if(str.startsWith("#WAV")) {
            soflanFlag = true;
        }
        else if(soflanFlag) {
            soflanFlag = false;
            for(let i = 0; i < bpmDict.length; i++) {
                result += "#BPM" + base36(i + 1) + " " + bpmDict[i] + "\r\n";
            }
            for(let i = 0; i < stopDict.length; i++) {
                result += "#STOP" + base36(i + 1) + " " + stopDict[i] + "\r\n";
            }
            for(let i = 0; i < scrollDict.length; i++) {
                result += "#SCROLL" + base36(i + 1) + " " + scrollDict[i] + "\r\n";
            }
        }
        if(str.search(/#[0-9]{3}([0-9A-F][0-9]|SC):.*/) >= 0) {
            chartFlag = true;
            let meas = Number(str.slice(1, 4));
            offset = Math.max(meas, offset);
        }
        else {
            if(chartFlag) continue;
            if(str.startsWith("#SCROLL")) continue;
            if(str.startsWith("#BPM") && !str.startsWith("#BPM ")) continue;
            if(str.startsWith("#STOP")) continue;
            result += str + "\r\n";
        }
    }
    result = appendChart(strsA, scrollDict, bpmDict, stopDict, 0, result);
    result = appendChart(strsB, scrollDict, bpmDict, stopDict, offset + 1, result);
    return result;
}

function appendChart(strs, scrollDict, bpmDict, stopDict, offset, result) {
    let scrollMap = {};
    let bpmMap = {};
    let stopMap = {};
    let startMeas = -1;
    let endMeas = 0;
    let flag = false;
    for(let str of strs) {
        if(str.startsWith("#SCROLL")) {
            scrollMap[str.slice(7, 9)] = Number(str.slice(10));
        }
        else if(str.startsWith("#BPM") && !str.startsWith("#BPM ")) {
            bpmMap[str.slice(4, 6)] = Number(str.slice(7));
        }
        else if(str.startsWith("#STOP")) {
            stopMap[str.slice(5, 7)] = Number(str.slice(8));
        }
        else if(str.search(/#[0-9]{3}([0-9A-F][0-9]|SC):.*/) >= 0) {
            flag = true;
            let meas = Number(str.slice(1, 4));
            if(startMeas == -1) {
                if(offset == 0) {
                    startMeas = 0;
                }
                else {
                    startMeas = meas;
                }
            }
            meas = meas + offset - startMeas;
            let ch = str.slice(4, 6);
            if(ch == "08") {
                result = replaceSoflan(str, bpmMap, bpmDict, meas, ch, result);
            }
            else if(ch == "09") {
                result = replaceSoflan(str, stopMap, stopDict, meas, ch, result);
            }
            else if(ch == "SC") {
                result = replaceSoflan(str, scrollMap, scrollDict, meas, ch, result);
            }
            else {
                result += "#" + ("000" + meas).slice(-3) + str.slice(4) + "\r\n";
            }
        }
        else {
            if(!flag) continue;
            result += str + "\r\n";
        }
    }
    return result;
}

function replaceSoflan(str, map, dict, meas, ch, result) {
    result += "#" + ("000" + meas).slice(-3) + ch + ":";
    str = str.slice(7);
    let len = str.length / 2;
    for(let i = 0; i < len; i++) {
        if(str.startsWith("00")) {
            result += "00";
        }
        else {
            let val = map[str.slice(0, 2)];
            result += base36(dict.indexOf(val) + 1);
        }
        str = str.slice(2);
    }
    result += "\r\n";
    return result;
}

function filter(dict) {
    dict.sort();
    for(let i = dict.length - 1; i >= 0; i--) {
        if(dict[i] == dict[i + 1]) {
            dict.splice(i, 1);
        }
    }
}

function appendSoflan(strs, scrollDict, bpmDict, stopDict) {
    for(let i = 0; i < strs.length; i++) {
        let str = strs[i];
        if(str.startsWith("#SCROLL")) {
            scrollDict.push(Number(str.slice(10)));
        }
        else if(str.startsWith("#BPM") && !str.startsWith("#BPM ")) {
            bpmDict.push(Number(str.slice(7)));
        }
        else if(str.startsWith("#STOP")) {
            stopDict.push(Number(str.slice(8)));
        }
    }
}

function downloadText(fileName, text) {
    const code = Encoding.stringToCode(text);
    var shiftJisCodeList = Encoding.convert(code, "SJIS", "Unicode");
    var uInt8List = new Uint8Array(shiftJisCodeList);
    const blob = new Blob([uInt8List], { type: "text/plain" });
    const aTag = document.createElement('a');
    aTag.href = URL.createObjectURL(blob);
    aTag.target = '_blank';
    aTag.download = fileName;
    aTag.click();
    URL.revokeObjectURL(aTag.href);
}

function base36(i) {
    let result = "";
    if(i / 36 <= 9) {
      result += String.fromCharCode('0'.charCodeAt(0) + (i / 36));
    }
    else {
      result += String.fromCharCode('A'.charCodeAt(0) + (i / 36 - 10));
    }
    if(i % 36 <= 9) {
      result += String.fromCharCode('0'.charCodeAt(0) + (i % 36));
    }
    else {
      result += String.fromCharCode('A'.charCodeAt(0) + (i % 36 - 10));
    }
    return result;
}

function unbase36(str) {
    let result = 0;
    if(str.charCodeAt(1) <= '9'.charCodeAt(0)) {
      result += str.charCodeAt(1) - '0'.charCodeAt(0);
    }
    else {
      result += str.charCodeAt(1) - 'A'.charCodeAt(0) + 10;
    }
    if(str.charCodeAt(0) <= '9'.charCodeAt(0)) {
      result += (str.charCodeAt(0) - '0'.charCodeAt(0)) * 36;
    }
    else {
      result += (str.charCodeAt(0) - 'A'.charCodeAt(0) + 10) * 36;
    }
    return result;
}

function comb(a, b) {
    var result = 1;
    for(let i = 0; i < b; i++) {
        result *= a - i;
        result /= i + 1;
    }
    return result;
}

function gcd(a, b) {
    if(a == 0) return b;
    if(b == 0) return a;
    while(a != b) {
        if(a > b) {
            a -= b;
        }
        else {
            b -= a;
        }
    }
    return a;
}

function bitCount(n) {
    n = n - ((n >> 1) & 0x55555555)
    n = (n & 0x33333333) + ((n >> 2) & 0x33333333)
    return ((n + (n >> 4) & 0xF0F0F0F) * 0x1010101) >> 24
}