/* ==========================================================================
   CRYSTAL HEART — opening animation
   Ported from "Crystal Heart Animation/" (this repo) so that it plays FIRST,
   the moment the site opens. When it ends (after a few seconds, or on tap)
   it fades away and the HBD flow (PIN gate → intro video → slides) begins.

   Poly Heart model by Quaternius [CC0]
   (https://creativecommons.org/publicdomain/zero/1.0/)
   via Poly Pizza (https://poly.pizza/m/1yCRUwFnwX)

   Changes from the stand-alone version:
   • three.js r135 is loaded as a classic (UMD) script + examples/js
     GLTFLoader, so it also works when index.html is opened from disk.
   • the music button / audio-reactive mode is left out — the site has its
     own background music after the PIN gate.
   • the renderer is disposed when the intro ends, freeing the GPU.
   • on tall (portrait) phone screens the camera steps back a little so the
     whole sparkle heart fits; landscape keeps the original framing.
   ========================================================================== */
(function () {
  'use strict';

  var intro = document.getElementById('heartIntro');
  if (!intro) return;
  var canvas = intro.querySelector('canvas');

  var THREE_CDN = [
    'https://cdn.jsdelivr.net/npm/three@0.135.0/',
    'https://unpkg.com/three@0.135.0/'
  ];
  var ASSETS = 'https://assets.codepen.io/74321/';

  var T0 = Date.now();
  var TAP_GUARD = 700;      // ignore taps during the very first moment
  var HOLD = 5200;          // the heart stays this long after it pops in
  var NO_MODEL_HOLD = 7000; // if the heart model can't load: particles only
  var HARD_CAP = 13000;     // never keep the site waiting longer than this

  var world = null;
  var finished = false;
  var holdTimer = 0;
  var capTimer = setTimeout(finish, HARD_CAP);

  /* ---------------------------------------------------------------- shaders */
  var vertexShader = [
    '#define M_PI 3.1415926535897932384626433832795',
    'uniform float uTime;',
    'uniform float uSize;',
    'attribute float aScale;',
    'attribute vec3 aColor;',
    'attribute float random;',
    'attribute float random1;',
    'attribute float aSpeed;',
    'varying vec3 vColor;',
    'varying vec2 vUv;',
    'void main() {',
    '  float sign = 2.0* (step(random, 0.5) -.5);',
    '  float t = sign*mod(-uTime *  aSpeed* 0.005  + 10.0*aSpeed*aSpeed, M_PI);',
    '  float a = pow(t, 2.0) * pow((t - sign * M_PI), 2.0);',
    '  float radius = 0.14;',
    '  vec3 myOffset = vec3(t,  1.0, 0.0);',
    '  myOffset = vec3(radius *16.0 * pow(sin(t), 2.0) * sin(t), radius * (13.0 * cos(t) - 5.0 * cos(2.0 * t) - 2.0 * cos(3.0 * t) - cos(4.0 * t)), .15*(a*(random1 - .5))*sin(abs(10.0*(sin(.2*uTime + .2*random)))*t));',
    '  vec3 displacedPosition = myOffset;',
    '  vec4 modelPosition = modelMatrix * vec4(displacedPosition.xyz, 1.0);',
    '  vec4 viewPosition = viewMatrix * modelPosition;',
    '  viewPosition.xyz += position * aScale * uSize * pow(a, .5) * .5;',
    '  gl_Position = projectionMatrix * viewPosition;',
    '  vColor = aColor;',
    '  vUv = uv;',
    '}'
  ].join('\n');

  var fragmentShader = [
    'varying vec3 vColor;',
    'varying vec2 vUv;',
    'void main() {',
    '  vec2 uv = vUv;',
    '  vec3 color = vColor;',
    '  float strength = distance(uv, vec2(0.5));',
    '  strength *= 2.0;',
    '  strength = 1.0 - strength;',
    '  gl_FragColor = vec4(strength * color, 1.0);',
    '}'
  ].join('\n');

  var vertexShader1 = [
    '#define M_PI 3.1415926535897932384626433832795',
    'uniform float uTime;',
    'uniform float uSize;',
    'attribute float aScale;',
    'attribute vec3 aColor;',
    'attribute float phi;',
    'attribute float random;',
    'attribute float random1;',
    'varying vec3 vColor;',
    'varying vec2 vUv;',
    'void main() {',
    '  float t = 0.01 * uTime + 12.0;',
    '  float angle = phi;',
    '  t = mod((-uTime + 100.0) * 0.06* random1 + random *2.0 * M_PI , 2.0 * M_PI);',
    '  vec3 myOffset = vec3(5.85*cos(angle * (t )), 2.0*(t - M_PI), 3.0*sin(angle * (t )/t));',
    '  vec4 modelPosition = modelMatrix * vec4(myOffset, 1.0);',
    '  vec4 viewPosition = viewMatrix * modelPosition;',
    '  viewPosition.xyz += position * aScale * uSize;',
    '  gl_Position = projectionMatrix * viewPosition;',
    '  vColor = aColor;',
    '  vUv = uv;',
    '}'
  ].join('\n');

  var fragmentShader1 = [
    'uniform sampler2D uTex;',
    'varying vec3 vColor;',
    'varying vec2 vUv;',
    'void main() {',
    '  vec2 uv = vUv;',
    '  vec3 color = vColor;',
    '  float strength = distance(uv, vec2(0.5, .65));',
    '  strength *= 2.0;',
    '  strength = 1.0 - strength;',
    '  vec3 texture = texture2D(uTex, uv).rgb;',
    '  gl_FragColor = vec4(texture * color * (strength + .3), 1.);',
    '}'
  ].join('\n');

  /* ------------------------------------------------------------------ world */
  class World {
    constructor({
      canvas,
      width,
      height,
      cameraPosition,
      fieldOfView = 75,
      nearPlane = 0.1,
      farPlane = 100,
      onHeart }) {
      this.onHeart = onHeart;
      this.parameters = {
        count: 1500,
        max: 12.5 * Math.PI,
        a: 2,
        c: 4.5
      };

      this.textureLoader = new THREE.TextureLoader();
      this.scene = new THREE.Scene();
      this.scene.background = new THREE.Color(0x16000a);
      this.clock = new THREE.Clock();
      this.data = 0;
      this.time = { current: 0, t0: 0, t1: 0, t: 0, frequency: 0.0005 };
      this.angle = { x: 0, z: 0 };
      this.width = width || window.innerWidth;
      this.height = height || window.innerHeight;
      this.aspectRatio = this.width / this.height;
      this.fieldOfView = fieldOfView;
      this.camera = new THREE.PerspectiveCamera(
        fieldOfView,
        this.aspectRatio,
        nearPlane,
        farPlane);

      this.camera.position.set(
        cameraPosition.x,
        cameraPosition.y,
        cameraPosition.z);
      this.baseZ = cameraPosition.z;
      this.fitCamera();

      this.scene.add(this.camera);
      this.renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: true
      });

      this.pixelRatio = Math.min(window.devicePixelRatio, 2);
      this.renderer.setPixelRatio(this.pixelRatio);
      this.renderer.setSize(this.width, this.height);
      this.timer = 0;
      this.dead = false;
      this.addToScene();

      this.render();
      this.listenToResize();
      this.listenToMouseMove();
    }
    render() {
      this.renderer.render(this.scene, this.camera);
    }
    fitCamera() {
      // The original pen is framed for landscape screens. On taller screens
      // pull the camera back just enough that the whole sparkle heart stays
      // inside the frame: its half-width is 0.14 * 16 = 2.24 (+ sprite size)
      // and its particles breathe up to ~0.46 towards the camera.
      // Landscape screens keep the original framing.
      var tanHalf = Math.tan(this.fieldOfView * Math.PI / 360);
      var fit = 0.46 + 2.29 / (tanHalf * (this.width / this.height) * 0.86);
      this.camera.position.z = Math.max(this.baseZ, fit);
    }
    loop() {
      if (this.dead) return;
      this.time.elapsed = this.clock.getElapsedTime();
      this.time.delta = Math.min(
        60,
        (this.time.current - this.time.elapsed) * 1000);

      this.camera.lookAt(this.scene.position);
      if (this.heartMaterial) {
        this.heartMaterial.uniforms.uTime.value +=
          this.time.delta * this.time.frequency * (1 + this.data * 0.2);
      }
      if (this.model) {
        this.model.rotation.y -= 0.0005 * this.time.delta * (1 + this.data);
      }
      if (this.snowMaterial) {
        this.snowMaterial.uniforms.uTime.value +=
          this.time.delta * 0.0004 * (1 + this.data);
      }
      this.render();

      this.time.current = this.time.elapsed;
      this.raf = requestAnimationFrame(this.loop.bind(this));
    }
    listenToResize() {
      this.onResize = () => {
        // Update sizes
        this.width = window.innerWidth;
        this.height = window.innerHeight;

        // Update camera
        this.camera.aspect = this.width / this.height;
        this.camera.updateProjectionMatrix();
        this.fitCamera();
        this.renderer.setSize(this.width, this.height);
      };
      window.addEventListener('resize', this.onResize);
    }
    listenToMouseMove() {
      this.onMouseMove = e => {
        if (!window.gsap) return;
        const x = e.clientX;
        const y = e.clientY;
        gsap.to(this.camera.position, {
          x: gsap.utils.mapRange(0, window.innerWidth, 0.2, -0.2, x),
          y: gsap.utils.mapRange(0, window.innerHeight, 0.2, -0.2, -y)
        });
      };
      window.addEventListener('mousemove', this.onMouseMove);
    }
    addHeart() {
      this.heartMaterial = new THREE.ShaderMaterial({
        fragmentShader: fragmentShader,
        vertexShader: vertexShader,
        uniforms: {
          uTime: { value: 0 },
          uSize: { value: 0.2 },
          uTex: {
            value: new THREE.TextureLoader().load(ASSETS + 'heart.png')
          }
        },
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        transparent: true
      });

      const count = this.parameters.count; //2000
      const scales = new Float32Array(count * 1);
      const colors = new Float32Array(count * 3);
      const speeds = new Float32Array(count);
      const randoms = new Float32Array(count);
      const randoms1 = new Float32Array(count);
      const colorChoices = [
        'white',
        'red',
        'pink',
        'crimson',
        'hotpink',
        'green'];

      const squareGeometry = new THREE.PlaneGeometry(1, 1);
      this.instancedGeometry = new THREE.InstancedBufferGeometry();
      Object.keys(squareGeometry.attributes).forEach(attr => {
        this.instancedGeometry.attributes[attr] = squareGeometry.attributes[attr];
      });
      this.instancedGeometry.index = squareGeometry.index;
      this.instancedGeometry.maxInstancedCount = count;

      for (let i = 0; i < count; i++) {
        const i3 = 3 * i;
        randoms[i] = Math.random();
        randoms1[i] = Math.random();
        scales[i] = Math.random() * 0.35;
        const colorIndex = Math.floor(Math.random() * colorChoices.length);
        const color = new THREE.Color(colorChoices[colorIndex]);
        colors[i3 + 0] = color.r;
        colors[i3 + 1] = color.g;
        colors[i3 + 2] = color.b;
        speeds[i] = Math.random() * this.parameters.max;
      }
      this.instancedGeometry.setAttribute(
        'random',
        new THREE.InstancedBufferAttribute(randoms, 1, false));
      this.instancedGeometry.setAttribute(
        'random1',
        new THREE.InstancedBufferAttribute(randoms1, 1, false));
      this.instancedGeometry.setAttribute(
        'aScale',
        new THREE.InstancedBufferAttribute(scales, 1, false));
      this.instancedGeometry.setAttribute(
        'aSpeed',
        new THREE.InstancedBufferAttribute(speeds, 1, false));
      this.instancedGeometry.setAttribute(
        'aColor',
        new THREE.InstancedBufferAttribute(colors, 3, false));

      this.heart = new THREE.Mesh(this.instancedGeometry, this.heartMaterial);
      this.scene.add(this.heart);
    }
    addToScene() {
      this.addModel();
      this.addHeart();
      this.addSnow();
    }
    async addModel() {
      if (!THREE.GLTFLoader) return;
      const model = await this.loadObj(ASSETS + 'heart.glb');
      if (this.dead || !model) return;
      this.model = model;

      this.model.scale.set(0.01, 0.01, 0.01);
      this.model.material = new THREE.MeshMatcapMaterial({
        matcap: this.textureLoader.load(
          ASSETS + '3.png',
          () => {
            if (this.dead) return;
            if (window.gsap) {
              gsap.to(this.model.scale, {
                x: 0.35,
                y: 0.35,
                z: 0.35,
                duration: 1.5,
                ease: 'Elastic.easeOut'
              });
            } else {
              this.model.scale.set(0.35, 0.35, 0.35);
            }
            if (this.onHeart) this.onHeart();
          }),
        color: '#ff89aC'
      });

      this.scene.add(this.model);
    }
    loadObj(path) {
      const loader = new THREE.GLTFLoader();
      return new Promise(resolve => {
        loader.load(
          path,
          response => {
            resolve(response.scene.children[0]);
          },
          () => { },
          () => {
            resolve(null);
          });
      });
    }
    addSnow() {
      this.snowMaterial = new THREE.ShaderMaterial({
        fragmentShader: fragmentShader1,
        vertexShader: vertexShader1,
        uniforms: {
          uTime: { value: 0 },
          uSize: { value: 0.3 },
          uTex: {
            value: new THREE.TextureLoader().load(ASSETS + 'heart.png')
          }
        },
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        transparent: true
      });

      const count = 550;
      const scales = new Float32Array(count * 1);
      const colors = new Float32Array(count * 3);
      const phis = new Float32Array(count);
      const randoms = new Float32Array(count);
      const randoms1 = new Float32Array(count);
      const colorChoices = ['red', 'pink', 'hotpink', 'green'];

      const squareGeometry = new THREE.PlaneGeometry(1, 1);
      this.instancedGeometry = new THREE.InstancedBufferGeometry();
      Object.keys(squareGeometry.attributes).forEach(attr => {
        this.instancedGeometry.attributes[attr] = squareGeometry.attributes[attr];
      });
      this.instancedGeometry.index = squareGeometry.index;
      this.instancedGeometry.maxInstancedCount = count;

      for (let i = 0; i < count; i++) {
        const phi = (Math.random() - 0.5) * 10;
        const i3 = 3 * i;
        phis[i] = phi;
        randoms[i] = Math.random();
        randoms1[i] = Math.random();
        scales[i] = Math.random() * 0.35;
        const colorIndex = Math.floor(Math.random() * colorChoices.length);
        const color = new THREE.Color(colorChoices[colorIndex]);
        colors[i3 + 0] = color.r;
        colors[i3 + 1] = color.g;
        colors[i3 + 2] = color.b;
      }
      this.instancedGeometry.setAttribute(
        'phi',
        new THREE.InstancedBufferAttribute(phis, 1, false));
      this.instancedGeometry.setAttribute(
        'random',
        new THREE.InstancedBufferAttribute(randoms, 1, false));
      this.instancedGeometry.setAttribute(
        'random1',
        new THREE.InstancedBufferAttribute(randoms1, 1, false));
      this.instancedGeometry.setAttribute(
        'aScale',
        new THREE.InstancedBufferAttribute(scales, 1, false));
      this.instancedGeometry.setAttribute(
        'aColor',
        new THREE.InstancedBufferAttribute(colors, 3, false));

      this.snow = new THREE.Mesh(this.instancedGeometry, this.snowMaterial);
      this.scene.add(this.snow);
    }
    destroy() {
      this.dead = true;
      cancelAnimationFrame(this.raf);
      window.removeEventListener('resize', this.onResize);
      window.removeEventListener('mousemove', this.onMouseMove);
      if (window.gsap) {
        gsap.killTweensOf(this.camera.position);
        if (this.model) gsap.killTweensOf(this.model.scale);
      }
      this.scene.traverse(obj => {
        if (obj.geometry) obj.geometry.dispose();
        const mats = obj.material ? (Array.isArray(obj.material) ? obj.material : [obj.material]) : [];
        mats.forEach(m => {
          Object.keys(m).forEach(k => { if (m[k] && m[k].isTexture) m[k].dispose(); });
          if (m.uniforms) {
            Object.keys(m.uniforms).forEach(k => {
              const v = m.uniforms[k].value;
              if (v && v.isTexture) v.dispose();
            });
          }
          m.dispose();
        });
      });
      this.renderer.dispose();
      try { this.renderer.forceContextLoss(); } catch (e) { /* ignore */ }
    }
  }

  /* ------------------------------------------------------------ hand-over */
  function showHint() { intro.classList.add('hi-ready'); }

  function finish() {
    if (finished) return;
    finished = true;
    clearTimeout(holdTimer);
    clearTimeout(capTimer);
    document.removeEventListener('keydown', onKey, true);
    intro.classList.add('hi-out');
    handOver();
    setTimeout(function () {
      if (world) {
        try { world.destroy(); } catch (e) { /* ignore */ }
        world = null;
      }
      intro.style.display = 'none';
      intro.setAttribute('aria-hidden', 'true');
    }, 950);
  }

  // Bring the PIN gate forward with a little pop as the heart fades away.
  function handOver() {
    if (document.body.classList.contains('unlocked')) return;
    var card = document.getElementById('gateCard');
    if (card) {
      card.classList.add('hi-pop');
      card.addEventListener('animationend', function done(e) {
        if (e.target !== card) return;
        card.classList.remove('hi-pop');
        card.removeEventListener('animationend', done);
      });
    }
    var box = document.querySelector('.pin-box');
    if (box && !box.value) {
      setTimeout(function () { try { box.focus(); } catch (e) { /* ignore */ } }, 380);
    }
  }

  function onKey(e) {
    if (finished) return;
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      finish();
    }
  }

  intro.addEventListener('click', function () {
    if (Date.now() - T0 > TAP_GUARD) finish();
  });
  document.addEventListener('keydown', onKey, true);

  /* -------------------------------------------------------------- loading */
  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.onload = function () { resolve(); };
      s.onerror = function () {
        if (s.parentNode) s.parentNode.removeChild(s);
        reject(new Error('failed: ' + src));
      };
      document.head.appendChild(s);
    });
  }

  function loadFromCdn(path) {
    var i = 0;
    return new Promise(function (resolve, reject) {
      (function next() {
        if (i >= THREE_CDN.length) { reject(new Error('cdn: ' + path)); return; }
        loadScript(THREE_CDN[i++] + path).then(resolve, next);
      })();
    });
  }

  // gsap arrives through a deferred <script>; deferred scripts have all run
  // by DOMContentLoaded, so waiting for it guarantees gsap (if reachable).
  function domReady() {
    if (document.readyState !== 'loading') return Promise.resolve();
    return new Promise(function (resolve) {
      document.addEventListener('DOMContentLoaded', function () { resolve(); }, { once: true });
    });
  }

  (window.THREE ? Promise.resolve() : loadFromCdn('build/three.min.js'))
    .then(function () {
      if (THREE.GLTFLoader) return null;
      // the heart model is optional — particles still play without it
      return loadFromCdn('examples/js/loaders/GLTFLoader.js').catch(function () { return null; });
    })
    .then(domReady)
    .then(function () {
      if (finished) return;
      world = new World({
        canvas: canvas,
        cameraPosition: { x: 0, y: 0, z: 4.5 },
        onHeart: function () {
          if (finished) return;
          showHint();
          clearTimeout(holdTimer);
          holdTimer = setTimeout(finish, HOLD);
        }
      });
      world.loop();
      holdTimer = setTimeout(function () { showHint(); holdTimer = setTimeout(finish, NO_MODEL_HOLD - 2500); }, 2500);
    })
    .catch(function () {
      // no WebGL / scripts blocked: show the words for a moment, then go on
      if (finished) return;
      if (world) { try { world.destroy(); } catch (e) { /* ignore */ } world = null; }
      showHint();
      clearTimeout(holdTimer);
      holdTimer = setTimeout(finish, 2000);
    });
})();
