// 特約事項テキスト（■/★/◆ 見出し付き）の解析と、表記ゆれ吸収用の正規化。
// ブラウザでは window.TokuyakuParser として公開する。
(function (root) {
  'use strict';

  var CATEGORIES = ['共通基本特約事項', '物件別基本特約事項', '物件別追加特約', '属性別特約', 'その他の特約', '駐車場特約', '保証会社別特約'];

  // 保証会社の表記 → 正式に扱う名前
  var GUARANTORS = [
    { name: 'ジェイリース', re: /ジェイリース/ },
    { name: '日本セーフティー', re: /日本セーフティ/ },
    { name: '全保連', re: /全保連/ },
    { name: 'オリコ', re: /オリコ/ },
    { name: 'Casa', re: /casa/i },
    { name: 'GTN', re: /gtn|グローバルトラスト/i },
    { name: 'いえらぶ', re: /いえらぶ/ },
    { name: 'ワイドネット', re: /ワイドネット/ }
  ];

  var ATTRIBUTES = [
    { name: '大手法人', re: /大手法人/ },
    { name: '法人', re: /法人契約|^法人/ },
    { name: '外国籍', re: /外国籍|外国人/ },
    { name: '定期借家', re: /定期借家|定借/ },
    { name: '入居者入替', re: /入居者入れ?替/ },
    { name: '名義変更', re: /名義変更/ }
  ];

  function nfkc(s) { return String(s == null ? '' : s).normalize('NFKC'); }

  // 検索・名寄せ用のキー。全角/半角・大小文字・ひらがな/カタカナ・空白・記号の違いを無視する。
  function normalizeKey(s) {
    return nfkc(s).toLowerCase()
      .replace(/[ぁ-ゖ]/g, function (ch) { return String.fromCharCode(ch.charCodeAt(0) + 0x60); })
      .replace(/[\s　・･.,、。\-‐－ー―_\/\\()（）\[\]【】「」『』〈〉<>:：;；!！?？'"`~〜～#＃*＊]/g, '');
  }

  function hasPlaceholder(s) { return /●/.test(s || ''); }

  function matchGuarantor(s) {
    var t = nfkc(s);
    for (var i = 0; i < GUARANTORS.length; i++) if (GUARANTORS[i].re.test(t)) return GUARANTORS[i].name;
    return null;
  }

  function matchAttributes(s) {
    var t = nfkc(s), out = [];
    ATTRIBUTES.forEach(function (a) {
      if (a.re.test(t) && out.indexOf(a.name) < 0) out.push(a.name);
    });
    if (out.indexOf('大手法人') >= 0) out = out.filter(function (x) { return x !== '法人'; });
    return out;
  }

  // 条文の先頭番号（1. / １１． / ． / ・ / 【１】．）を外す
  var CLAUSE_START = /^\s*(?:【[0-9０-９]+】\s*[.．、]?|[0-9０-９]+\s*[.．、](?![0-9０-９])|[.．](?![0-9０-９])|・)\s*/;
  function stripNumber(line) {
    var m = line.match(CLAUSE_START);
    if (!m) return null;
    return line.slice(m[0].length).trim();
  }

  function dateFrom(text) {
    var m = nfkc(text).match(/(\d{4})\s*[.\/年]\s*(\d{1,2})\s*月?\s*[～~〜]/);
    if (!m) return null;
    var mm = ('0' + m[2]).slice(-2);
    return m[1] + '-' + mm + '-01';
  }

  // 見出し文字列から、表示名・サブタグ・補足・適用開始日を取り出す
  function analyzeTitle(raw) {
    var title = String(raw || '').replace(/[★■◆]/g, '').trim();
    var subTags = [], notes = [], effectiveFrom = null;
    title = title.replace(/【([^】]*)】/g, function (_, inner) {
      var d = dateFrom(inner);
      if (d) effectiveFrom = d;
      else if (inner.trim()) subTags.push(inner.trim());
      return ' ';
    });
    title = title.replace(/[（(]([^）)]*)[）)]/g, function (_, inner) {
      var d = dateFrom(inner);
      if (d) effectiveFrom = d;
      else if (inner.trim()) notes.push(inner.trim());
      return ' ';
    });
    var arrow = title.split(/⇒|→/);
    if (arrow.length > 1) { notes.push(arrow.slice(1).join(' ').trim()); title = arrow[0]; }
    title = title.replace(/[\s　]+/g, ' ').trim();
    return { name: title, subTags: subTags, notes: notes, effectiveFrom: effectiveFrom };
  }

  var NOT_BUILDING = /特約|事項|場合|補足|加入|変更|利用|備考|サービス|記載|契約|キャンペーン|について|…/;

  // 見出しからカテゴリ等を推定する（あくまで下書き。取り込み画面で修正する前提）
  function classify(block, parent) {
    var titleRaw = block.title;
    var info = analyzeTitle(titleRaw);
    var text = nfkc(titleRaw);
    var parentCat = parent ? parent.category : null;
    var parentText = parent ? nfkc(parent.title) : '';
    var r = {
      category: null, buildings: [], subTags: info.subTags.slice(), attributes: matchAttributes(text),
      guarantors: [], effectiveFrom: info.effectiveFrom, memo: [], name: info.name
    };
    var g = matchGuarantor(text);
    // カテゴリ判定には（）内の補足を使わない（例: KAYADA2126（定期借家：非再契約）は建物名）
    var nameAttrs = matchAttributes(text.replace(/[（(][^）)]*[）)]/g, ''));

    if (/特約基本事項|基本特約/.test(text)) r.category = '共通基本特約事項';
    else if (/駐車場|駐車区画|車両/.test(text)) r.category = '駐車場特約';
    else if (g) { r.category = '保証会社別特約'; r.guarantors = [g]; }
    else if (nameAttrs.length && !(parentCat === '物件別追加特約')) r.category = '属性別特約';
    else if (info.name && (parentCat === '物件別追加特約' || /物件別/.test(parentText) || (!NOT_BUILDING.test(info.name) && !/物件別/.test(text)))) {
      r.category = '物件別追加特約'; r.buildings = [info.name];
    }
    else if (/物件別/.test(text)) r.category = '物件別追加特約';
    else if (parentCat && parentCat !== '物件別追加特約') r.category = parentCat;
    else r.category = 'その他の特約';

    // 親が建物なら、◆駐車場 のような子見出しにも建物を引き継ぐ
    if (parent && parent.buildings && parent.buildings.length && !r.buildings.length) r.buildings = parent.buildings.slice();
    if (parent && r.category === parentCat) {
      if (!r.guarantors.length && parent.guarantors) r.guarantors = parent.guarantors.slice();
    }
    if (r.attributes.indexOf('定期借家') >= 0 && r.subTags.indexOf('定期借家') < 0) r.subTags.push('定期借家');
    return r;
  }

  function isFeeLine(line) {
    return /円/.test(line) && /(オーナーへ送金|売上)/.test(line) && !/。\s*$/.test(line);
  }

  function parseFee(line, building, item) {
    var t = line.replace(/^[\s　]*・/, '').trim();
    var parts = t.split(/[\s　]{2,}|　+/).map(function (x) { return x.trim(); }).filter(Boolean);
    var fee = { building: building || '', item: item || 'その他', amount: null, billing: '月額', taxType: null, breakdown: null, handling: null, memo: null };
    var n = nfkc(t);
    var am = n.match(/(月額|一時金)?\s*([\d,]+)\s*円/);
    if (am) { fee.amount = parseInt(am[2].replace(/,/g, ''), 10); if (am[1]) fee.billing = am[1]; }
    var tx = n.match(/税込|非課税|税抜|税別/); if (tx) fee.taxType = tx[0];
    var bd = n.match(/\(([\d,]+\s*\+\s*[\d,]+)\)/); if (bd) fee.breakdown = bd[1].replace(/\s/g, '');
    var hd = n.match(/オーナーへ送金|売上/); if (hd) fee.handling = hd[0];
    if (!building && parts.length) fee.building = parts[0];
    else if (building && parts.length && !/円|送金|売上/.test(parts[0])) fee.item = parts[0];
    return fee;
  }

  function parse(text) {
    var lines = String(text || '').replace(/^﻿/, '').split(/\r?\n/);
    var blocks = [], fees = [], warnings = [];
    var section = null, item = null, cur = null;
    var feeMode = null, lastFeeBuilding = null;
    var gap = false, lastWasClause = false;

    function newBlock(title, level, parent, lineNo) {
      var b = { title: title, level: level, lineNo: lineNo, clauses: [], memo: [], parentTitle: parent ? parent.title : '' };
      var c = classify(b, parent);
      var own = String(title).replace(/[★■◆]/g, '').replace(/[\s　]+/g, ' ').trim();
      if (own === '(見出しなし)') own = '';
      b.heading = own || (parent ? parent.heading : '') || '(見出しなし)';
      if (level === 'item' && parent && parent.heading && own && c.category === parent.category && c.category !== '物件別追加特約')
        b.heading = parent.heading + ' ＞ ' + own;
      if (level === 'sub' && parent && own) b.heading = parent.heading + ' ＞ ' + own;
      b.category = c.category; b.buildings = c.buildings; b.subTags = c.subTags; b.attributes = c.attributes;
      b.guarantors = c.guarantors; b.effectiveFrom = c.effectiveFrom; b.memo = c.memo;
      b.versionLabel = c.category === '共通基本特約事項' ? (c.effectiveFrom ? c.effectiveFrom.slice(0, 4) + '.' + parseInt(c.effectiveFrom.slice(5, 7), 10) + '〜版' : '通常版') : null;
      blocks.push(b);
      gap = false; lastWasClause = false;
      return b;
    }

    for (var i = 0; i < lines.length; i++) {
      var raw = lines[i], line = raw.replace(/\s+$/, ''), lineNo = i + 1;
      var trimmed = line.trim();
      if (!trimmed) { gap = true; lastWasClause = false; continue; }

      // 見出し
      if (/^■/.test(trimmed)) {
        feeMode = null;
        var rest = trimmed.replace(/^■/, '');
        if (/^[\s　]/.test(rest) && /。$/.test(rest.trim())) {
          // 「■　〜するものとする。」のように見出しと本文が1行になっている
          section = newBlock('■' + rest.trim().slice(0, 24) + '…', 'section', null, lineNo);
          section.clauses.push({ body: rest.trim(), lineNo: lineNo });
        } else {
          section = newBlock(trimmed, 'section', null, lineNo);
        }
        item = null; cur = section; continue;
      }
      if (/^★/.test(trimmed)) {
        feeMode = null;
        item = newBlock(trimmed, 'item', section, lineNo); cur = item; continue;
      }
      if (/^◆/.test(trimmed) || /^[A-CＡ-Ｃ]\s*(?:[-－ー―]\s*[0-9０-９])?\s*$/.test(trimmed)) {
        feeMode = null;
        cur = newBlock(trimmed, 'sub', item || section, lineNo); continue;
      }
      var feeHead = trimmed.match(/^【([^】]*(町会費|水道)[^】]*)】\s*$/);
      if (feeHead) { feeMode = feeHead[2] === '水道' ? '水道料' : '町会費'; lastFeeBuilding = null; continue; }

      if (feeMode && /^・/.test(trimmed)) {
        var fee = parseFee(trimmed, null, feeMode);
        if (/^[〃\s　]*$/.test(fee.building) || /〃/.test(fee.building)) fee.building = lastFeeBuilding || '';
        lastFeeBuilding = fee.building;
        fee.lineNo = lineNo;
        fees.push(fee); continue;
      }

      if (!cur) {
        cur = newBlock('(見出しなし)', 'section', null, lineNo);
      }

      if (isFeeLine(trimmed)) {
        var f = parseFee(trimmed, cur.buildings[0] || cur.heading, null);
        f.lineNo = lineNo; fees.push(f);
        continue;
      }

      var body = stripNumber(line);
      if (body !== null) {
        cur.clauses.push({ body: body, lineNo: lineNo });
        lastWasClause = true; gap = false; continue;
      }

      if (/^※/.test(trimmed) && cur.clauses.length && lastWasClause && !gap) {
        var last = cur.clauses[cur.clauses.length - 1];
        last.body += '\n' + trimmed;
        continue;
      }
      if (/^※|^（（（|^【備考】/.test(trimmed)) {
        cur.memo.push(trimmed); gap = false; continue;
      }

      // 番号なしの行
      if (cur.clauses.length && lastWasClause && !gap && !/。\s*$/.test(cur.clauses[cur.clauses.length - 1].body)) {
        cur.clauses[cur.clauses.length - 1].body += trimmed;
      } else {
        cur.clauses.push({ body: trimmed, lineNo: lineNo });
      }
      lastWasClause = true; gap = false;
    }

    blocks.forEach(function (b) {
      b.memo = b.memo.join('\n');
      if (!b.clauses.length && b.memo) warnings.push('「' + b.heading + '」は本文がなくメモのみです（' + b.lineNo + '行目）');
    });
    var used = blocks.filter(function (b) { return b.clauses.length; });
    return { blocks: used, fees: fees, warnings: warnings };
  }

  var api = {
    CATEGORIES: CATEGORIES, GUARANTORS: GUARANTORS.map(function (g) { return g.name; }),
    normalizeKey: normalizeKey, hasPlaceholder: hasPlaceholder, stripNumber: stripNumber,
    matchGuarantor: matchGuarantor, analyzeTitle: analyzeTitle, parse: parse
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TokuyakuParser = api;
})(typeof window !== 'undefined' ? window : this);
