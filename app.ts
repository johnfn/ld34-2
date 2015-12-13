/// <reference path="lib/lib.d.ts"/>

// TODO: parse map json (better than phaser -_-)

interface CustomTileProperties {
  powerupType: string;
}

enum HealthEvents {
  /**
   * args: previous health, new health
   */
  ChangeHealth
}

interface HasHealth {
  healthEvents: Events<HealthEvents>;
  health: number;
  maxHealth: number;
}

type Inventory = MagicDict<InventoryContents, number>;

class G {
  static ship: Ship;
  static inventory: MagicDict<InventoryContents, number>;

  static map: TiledMapParser;
  static hud: HUD;
  static explosionMaker: ParticleExplosionMaker;
  static staticEmitter: ParticleEmitter;

  static get walls(): Group<Sprite> {
    return new Group(G.map.getTileLayer("Wall").children);
  }
}

enum InventoryContents {
  Token,
  Fuel,
  DamageIncrease,
  DoubleJump
}

class RingGuideThing extends Sprite {
  private _ring: Sprite;
  private _dot: Sprite;
  private _ticks: number = 0;

  constructor() {
    super();

    this._ring = new Sprite("assets/ring.png").addTo(this).moveTo(-50, -50);
    this._dot = new Sprite("assets/dot.png").addTo(this).moveTo(0, 0);

    this._ring.z = 0;
    this._dot.z  = 1;

    this._ticks = 0;
  }

  update(): void {
    this._ticks++;

    const theta = this._ticks / 20;
    const x = Math.sin(theta) * 50;
    const y = Math.cos(theta) * 50;

    this._dot.x = x - 6; // subtract half width of dot plus random fudge factor bc i dont understand trigonometry -_-
    this._dot.y = y - 6;
  }

  public get aimedX(): number {
    const theta = this._ticks / 20;

    return Math.sin(theta);
  }

  public get aimedY(): number {
    const theta = this._ticks / 20;

    return Math.cos(theta);
  }
}

// We are using health as fuel here

@component(new PhysicsComponent({
  immovable: true,
  solid: true
}))
@component(new FollowWithCamera())
class Ship extends Sprite implements HasHealth {
  public inventory: Inventory;

  healthEvents: Events<HealthEvents>;
  health: number;
  maxHealth: number;

  vx: number = 0;
  vy: number = 0;

  private ringThing: RingGuideThing;

  /**
   * Note: Pass in cloned inventory rather than original.
   * 
   * @param inventory
   */
  constructor(inventory: Inventory) {
    super("assets/ship.png");

    this.healthEvents = new Events<HealthEvents>();
    this.inventory = new MagicDict<InventoryContents, number>(() => 0);

    this.x = 200;
    this.y = 200;

    this.ringThing = new RingGuideThing().addTo(this);

    this.physics.collidesWith = G.walls;
  }

  addItemToInventory(item: InventoryContents): void {
    this.inventory.put(item, this.inventory.get(item) + 1);
  }

  update(): void {
    super.update();

    this.ringThing.moveTo(16, 16);

    if (Globals.keyboard.justDown.Z) {
      this.tween.addTween("showRing", 30, e => {
        this.ringThing.alpha = e.percentage;
      })
    }

    if (!Globals.keyboard.down.Z) {
      this.ringThing.alpha = 0;
    }

    if (Globals.keyboard.justDown.X && Globals.keyboard.down.Z) {
      this.vx = this.ringThing.aimedX * 10;
      this.vy = this.ringThing.aimedY * 10;
    }

    if (this.vx != 0 || this.vy != 0) {
      this.physics.moveBy(this.vx, this.vy);

      this.vx += -Util.Sign(this.vx) * 0.1;
      this.vy += -Util.Sign(this.vy) * 0.1;

      if (Math.abs(this.vx) <= .1) this.vx = 0;
      if (Math.abs(this.vy) <= .1) this.vy = 0;

      const summedVelocity = (Math.abs(this.vx) + Math.abs(this.vy));

      if ((summedVelocity < 8 && Math.random() > .9) ||
          (summedVelocity > 8 && Math.random() > .3)) {
        G.staticEmitter.emitAt(this.x + this.width / 2, this.y + this.height / 2, -this.vx, -this.vy);
      }
    }
  }
}

class Pickup extends Sprite {
  pickup(): void {
    G.explosionMaker.explodeAt(this.globalX, this.globalY);

    this.destroy();
  }

  update(): void {
    super.update();

    if (Math.random() > .9) {
      G.staticEmitter.emitIn(this.globalBounds);
    }
  }
}

class DoubleJump extends Pickup {
  constructor() {
    super("assets/token.png");
  }

  public pickup(): void {
    super.pickup();

    G.ship.addItemToInventory(InventoryContents.Token);
  }
}

class PowerIncrease extends Pickup {
  constructor() {
    super("assets/powerincrease.png");
  }

  public pickup(): void {
    super.pickup();

    G.ship.addItemToInventory(InventoryContents.DamageIncrease);
  }
}

class HealthBar extends Sprite {
  private _barWidth: number = 100;
  private _barHeight: number = 15;

  private _healthbarRed: Sprite;
  private _healthbarGreen: Sprite;
  private _healthbarText: TextField;

  private _showText: boolean = false;

  private _target: HasHealth;

  constructor(target: HasHealth, width: number = 100, height: number = 15) {
    super();

    this._target = target;
    this._barWidth = width;
    this._barHeight = height;

    this.createHealthbar();

    target.healthEvents.on(HealthEvents.ChangeHealth, (prevHealth: number, currentHealth: number) => {
      this.tween.addTween("animate-healthbar", 15, (e: Tween) => {
        this.animateHealthbar(e, prevHealth, currentHealth);
      })
    });
  }

  animateHealthbar(e: Tween, prevHealth: number, currentHealth: number): void {
    const prevWidth: number = (prevHealth / this._target.maxHealth) * this._barWidth;
    const nextWidth: number = (currentHealth / this._target.maxHealth) * this._barWidth;

    this._healthbarGreen.width = Util.Lerp(prevWidth, nextWidth, e.percentage);
  }

  createHealthbar(): void {
    this._healthbarRed = new Sprite("assets/healthbar_red.png")
      .moveTo(10, 10)
      .setZ(4)
      .setDimensions(this._barWidth, this._barHeight)
      .addTo(this);

    this._healthbarGreen = new Sprite("assets/healthbar_green.png")
      .moveTo(10, 10)
      .setZ(5)
      .setDimensions(this._barWidth, this._barHeight)
      .addTo(this);

    if (this._showText) {
      this._healthbarText = new TextField("10/10")
        .setDefaultTextStyle({ font: "12px Verdana", fill: "white" })
        .moveTo(12, 10)
        .setZ(6)
        .addTo(this);
    }
  }

  update(): void {
    super.update();
  }
}


class Fuel extends Pickup {
  constructor() {
    super("assets/fuel.png");
  }

  public pickup(): void {
    super.pickup();

    G.ship.addItemToInventory(InventoryContents.Fuel);
  }
}

class IconAndText extends Sprite {
  _icon: Sprite;
  _text: TextField;

  constructor(iconPath: string) {
    super();

    this._icon = new Sprite(iconPath).addTo(this);

    this._icon.x = 0;
    this._icon.y = 0;

    this._text = new TextField("??").addTo(this);

    this._text.x = 40;
    this._text.y = 0;

    this.z = 10;
  }

  setText(text: string): void {
    this._text.text = text;
  }
}

@component(new FixedToCamera(0, 0))
class HUD extends Sprite {
  private _fuel:   IconAndText;
  private _tokens: IconAndText;

  constructor() {
    super();

    this.z = 20;

    this._fuel      = new IconAndText("assets/fuel.png") .moveTo(120, 10).addTo(this);
    this._tokens    = new IconAndText("assets/token.png").moveTo(210, 10).addTo(this);
  }

  update(): void {
    this._fuel.setText(String(G.ship.inventory.get(InventoryContents.Fuel)));
    this._tokens.setText(String(G.ship.inventory.get(InventoryContents.Token)));
  }
}

class MyGame extends Game {
  constructor() {
    super(600, 400, document.getElementById("main"), 0x000000, true);

    G.map = new TiledMapParser("assets/map.json")
      .addObjectParser(22, (texture, json) => {
        console.log("yay!");

        return null;
      })
      .parse();
  }

  loadingComplete(): void {
    G.inventory = new MagicDict<InventoryContents, number>();

    G.inventory.put(InventoryContents.Token, 1)
    G.inventory.put(InventoryContents.Fuel, 2)

    G.ship = new Ship(G.inventory.clone());

    Globals.camera.x = Globals.stage.width / 2;
    Globals.camera.y = Globals.stage.height / 2;

    G.hud = new HUD();
    Globals.stage.addChild(G.hud);

    Globals.stage.addChild(G.ship);

    G.map.z = -10;

    Globals.stage.addChild(G.map);

    G.explosionMaker = new ParticleExplosionMaker("assets/particles.png", 16, 16, 64, 16);
    G.staticEmitter = new ParticleEmitter("assets/particles.png", 16, 16, 64, 16);

    Globals.stage.addChild(G.explosionMaker);
    Globals.stage.addChild(G.staticEmitter);

    new FPSCounter();

    super.loadingComplete();
  }
}

Util.RunOnStart(() => {
  Debug.DEBUG_MODE = false;

  new MyGame();
});
