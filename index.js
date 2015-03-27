'use strict';

/*
 * npm install git://github.com/FluffyJack/node-rolling-spider.git
 */

var HID = require('node-hid'),
    pakkit = require('pakkit'),
    RollingSpider = require("rolling-spider");

var drone = new RollingSpider(),
    status = {
        flying: false
    },
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
        plus: false,
        minus: false,
        home: false
    };

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

            if (packet.buttons.hasOwnProperty('plus')) {
                buttons.plus = packet.buttons.plus === true;
            }

            if (JSON.stringify(prevSticks) !== JSON.stringify(sticks)) {
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

        drone.flatTrim();

        function commandLoop() {
            if (buttons.plus) {
                buttons.plus = false;
                if (status.flying) {
                    status.flying = false;
                    console.log('land');
                    drone.land();
                } else {
                    status.flying = true;
                    console.log('takeOff');
                    drone.takeOff();
                }
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

        console.log('Start listening to Wiimote commands...');
        setInterval(commandLoop, 50);
    });
});
