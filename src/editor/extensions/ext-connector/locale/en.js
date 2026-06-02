export default {
  name: 'Connector',
  langListTitle: 'Connect two objects',
  langList: [
    { id: 'mode_connect', title: 'Connect two objects' }
  ],
  buttons: [
    {
      title: 'Connect two objects'
    }
  ],
  routing: {
    straight: 'Straight routing',
    elbow: 'Elbow (orthogonal) routing',
    leader: 'Leader-line style'
  }
}
