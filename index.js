'use strict';

var HID = require('node-hid'),
    pakkit = require('pakkit'),
    RollingSpider = require("rolling-spider");

var drone = new RollingSpider(),
    joysticks = {
        left: {
            x: 0,
            y: 0
        },
        right: {
            x: 0,
            y: 0
        }
    },
    buttons = {
        plus: {
            count: 0,
            modulus: 1,
            actions: [
                ['toggle']
            ]
        },
        minus: {
            count: 0,
            modulus: 1,
            actions: [
                ['flatTrim']
            ]
        },
        home: {
            count: 0,
            modulus: 1,
            actions: [
                ['emergency']
            ]
        },
        l: {
            count: 0,
            modulus: 1,
            actions: [
                ['backFlip']
            ]
        },
        r: {
            count: 0,
            modulus: 1,
            actions: [
                ['frontFlip']
            ]
        },
        zl: {
            count: 0,
            modulus: 1,
            actions: [
                ['leftFlip']
            ]
        },
        zr: {
            count: 0,
            modulus: 1,
            actions: [
                ['rightFlip']
            ]
        }
    },
    actions = [];

var packets = pakkit.export({
    WII_U_PRO_CONTROLLER : {
        buttons: {
            mask: [
                null, null, null, null, null, null,
                'plus', 'minus', 'home',
                null, null,
                'dup', 'ddown', 'dleft', 'dright',
                'a', 'b', 'x', 'y',
                'l', 'r',
                'zl', 'zr',
                'leftstick', 'rightstick'
            ],
            type: 'uint32le'
        },
        left: {
            type: 'joystick'
        },
        right: {
            type: 'joystick'
        }
    }
}, {
    joystick: {
        read: function(parser, attribute) {
            parser
                .int8(attribute.name + 'X')
                .int8(attribute.name + 'Y')
                .tap(function() {
                    this.vars[attribute.name] = {
                        x: this.vars[attribute.name + 'X'],
                        y: this.vars[attribute.name + 'Y'] * -1
                    };
                    delete(this.vars[attribute.name + 'X']);
                    delete(this.vars[attribute.name + 'Y']);
                });
        }
    }
});

function normalize(value) {
    // Create a dead-zone for the joysticks
    if (Math.abs(value) < 10) return 0;

    var sign = value < 0 ? -1 : 1,
        normalized = 100 * Math.min(Math.abs(value) / 65, 1);

    return ~~(sign * normalized);
}

HID.devices().forEach((function(d) {
    if(d && d.product.toLowerCase().indexOf('wiimote') !== -1) {

        console.log('Found a Wiimote');
        var hid = new HID.HID(d.path),
            prevSticks = {
                left: joysticks.left,
                right: joysticks.right
            };

        var read = function (error, data) {
            var packet = packets.WII_U_PRO_CONTROLLER.read(data),
                sticks = {
                    left: packet.left,
                    right: packet.right
                };

            Object.keys(buttons).forEach(function (key) {
                if (buttons.hasOwnProperty(key) && packet.buttons.hasOwnProperty(key) && packet.buttons[key]) {
                    console.log('Pressed button:', key);
                    actions = actions.concat(buttons[key].actions[++buttons[key].count % buttons[key].modulus]);
                }
            });

            if (JSON.stringify(sticks) !== JSON.stringify(prevSticks)) {
                joysticks = {
                    left: {
                        x: normalize(packet.left.x),
                        y: normalize(packet.left.y)
                    },
                    right: {
                        x: normalize(packet.right.x),
                        y: normalize(packet.right.y)
                    }
                };
            }

            prevSticks = sticks;
            hid.read(read);
        };

        hid.read(read);
    }
}));

drone.connect(function () {
    drone.setup(function () {

        function commandLoop() {
            if (actions.length) {
                drone[actions[0]]();
                console.log('Sent action:', actions[0]);
                actions.shift();
                return;
            }

            drone.drive(
                joysticks.right.x,
                joysticks.right.y,
                joysticks.left.x,
                joysticks.left.y,
                1
            );
        }

        drone.flatTrim();
        setInterval(commandLoop, 20);
        console.log('Start listening to Wii controller inputs...');
    });
});
