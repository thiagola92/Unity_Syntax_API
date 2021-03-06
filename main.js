const puppeteer = require('puppeteer');
const { concatAPI, toFile } = require('./utility');

let requires = [];  // require
let objects = []; // objects, classes, enumerations
let properties = []; // obj.propertyName

let methods = []; // temporary information
let signatures = []; // obj.methodName(x, y, z);

const linkAPI = 'https://docs.unity3d.com/2017.4/Documentation/ScriptReference/'

const captureEverything = `([_"', <>=/:;}{.\\.\\w\\-\\)\\(\\n\\r\\[\\]\\?]*?)`; // Sometimes (.*) wasn't capturing everything...
const captureLink = `([\\w\\.\\-]*?)`;
const captureName = `([\\w]*?)`;

puppeteer.launch()
  .then(async browser => {
    const page = (await browser.pages())[0];

    await page.goto(linkAPI + 'index.html');

    const content =  await page.content();
    const regexAPI = /<h2>Scripting API<\/h2>(.*)<div class="mCSB_scrollTools" style="position: absolute; display: none;">/g;
    const contentAPI = regexAPI.exec(content)[1];

    await getRequires(contentAPI);
    await getObjects(contentAPI);
    await getObjectsInfo(browser);
    await browser.close();

    concatAPI();

    console.log("Finished");
  });

function getRequires(contentAPI) {
  const regex = /<span>([\w_\-\.<>]*?)<\/span>/g;
  let contentRequire = regex.exec(contentAPI);

  while(contentRequire != null) {
    const requireName = contentRequire[1];

    contentRequire = regex.exec(contentAPI);

    if(requireName === 'Classes' || requireName === 'Interfaces' || requireName === 'Enumerations' || requireName === 'Attributes' || requireName === 'Assemblies')
      continue;

    requires.push({
      text: requireName,
      type: 'require'
    });

    console.clear();
    console.log(requireName);
  }

  toFile("unity_requires.json", requires);
  requires = null; // free memory
}

function getObjects(contentAPI) {
  const regex = new RegExp('<a href="' + captureLink + '" id="" class="">' + captureName + '<\\/a>', 'g')
  let contentPage = regex.exec(contentAPI);

  while(contentPage != null) {
    const pageLink = contentPage[1];
    const pageName = contentPage[2];

    contentPage = regex.exec(contentAPI);

    objects.push({
      text: pageName,
      descriptionMoreURL: linkAPI + pageLink
    });
  }
}

async function getObjectsInfo(browser) {
  for(const object of objects) {
    const page = await browser.newPage();
    await page.goto(object.descriptionMoreURL);

    const content = await page.content();
    await page.close()

    const description = new RegExp('<h2>Description<\\/h2><p>' + captureEverything + '<\\/p>', 'g');
    const type = new RegExp('<p class="cl mb0 left mr10">' + captureName + '(?: |<\\/p>)');

    object.description = get(description, content);
    object.type = get(type, content);

    console.clear();
    console.log(object.text);

    getStaticProperties(content, object.text);
    getStaticMethods(content, object.text);
  }

  toFile("unity_properties.json", properties);
  toFile("unity_objects.json", objects);

  properties = null; // free memory
  objects = null; // free memory

  await getSignatures(browser);
}

function get(regex, content) {
  const search = regex.exec(content);

  if(search == null)
    return null;

  return search[1];
}

function getStaticProperties(content, text) {
  const regex = new RegExp('<div class="subsection"><h2>Static Properties<\\/h2>' + captureEverything + '<\\/div>', 'g');
  const contentProperties = regex.exec(content);

  if(contentProperties == null)
    return null;

  getProperties(contentProperties[1], text);
}

function getProperties(content, text) {
  const regex = new RegExp('<td class="lbl"><a href="' + captureLink + '">' + captureName + '<\/a><\/td><td class="desc">' + captureEverything + '<\\/td>', 'g');
  let contentProperty = regex.exec(content);

  while(contentProperty != null) {
    const propertyName = text + '.' + contentProperty[2];
    const propertyLink = linkAPI + contentProperty[1];
    const propertyDescription = contentProperty[3];

    properties.push({
      text: propertyName,
      description: propertyDescription,
      descriptionMoreURL: propertyLink,
      type: "property"
    });

    console.clear();
    console.log(propertyName);

    contentProperty = regex.exec(content);
  }
}

function getStaticMethods(content, text) {
  const regex = new RegExp('<div class="subsection"><h2>Static Methods<\\/h2>' + captureEverything + '<\\/div>', 'g');
  const contentMethods = regex.exec(content);

  if(contentMethods == null)
    return null;

  getMethods(contentMethods[1], text);
}

function getMethods(content, text) {
  const regex = new RegExp('<td class="lbl"><a href="' + captureLink + '">' + captureName + '<\\/a><\\/td><td class="desc">' + captureEverything + '<\\/td>', 'g');
  let contentMethod = regex.exec(content);

  while(contentMethod != null) {
    const methodName = text + '.' + contentMethod[2];
    const methodLink = linkAPI + contentMethod[1];
    const methodDescription = contentMethod[3];

    methods.push({
      text: methodName,
      description: methodDescription,
      descriptionMoreURL: methodLink,
      type: "method"
    });

    console.clear();
    console.log(methodName);

    contentMethod = regex.exec(content);
  }
}

async function getSignatures(browser) {
  for(let method of methods) {
    const page = await browser.newPage()
    await page.goto(method.descriptionMoreURL);

    const content = await page.content();
    await page.close();

    // Unity 2017 you could choose between C# or JS
    // The html could be
    //  <div class="signature-CS sig-block" style="">
    // or
    //  <div class="signature-CS sig-block" style="display: none;">
    const ignoreThisHTML = "[^>]*";

    const regex = new RegExp('<div class="signature-CS sig-block"' + ignoreThisHTML + '>' + captureEverything + '<\\/div>', 'g');
    let sign = regex.exec(content);

    while(sign != null) {
      let signature = method.text + getSignature(sign[1]);

      signatures.push({
        snippet: signature,
        description: method.description,
        descriptionMoreURL: method.descriptionMoreURL,
        type: "method"
      })

      console.clear();
      console.log(signature);

      sign = regex.exec(content);
    }
  }

  toFile("unity_signatures.json", signatures);

  methods = null; // free memory
  signatures = null; // free memory
}

function getSignature(content) {
  let signature = "(";

  const regex = new RegExp('<span class="sig-kw">' + captureEverything + '<\/span>', 'g');
  regex.exec(content); // skipping the method name

  let parameter_number = 1;
  let parameter = regex.exec(content);

  while(parameter != null) {
    signature = signature + "${" + parameter_number + ":" + parameter[1] + "}";

    parameter_number = parameter_number + 1;
    parameter = regex.exec(content);

    if(parameter != null)
      signature = signature + ", ";
  }

  signature = signature + ")"

  return signature;
}
